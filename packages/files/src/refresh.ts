// `files.refresh` (D-366): the inline values and variants a field's files
// lack, made from their bodies as an upload makes them, then the copy of each
// row holding one written again as attaching it writes it, without hooks.
import { randomUUID } from 'node:crypto'
import type { Identity, QueryOptions } from 'ultimabase'
import { isMaster, PublicError } from 'ultimabase'
import type { StoredField } from 'ultimabase/internal'
import { storedFields } from 'ultimabase/internal'
import type { FileOptions } from './field.ts'
import { keysOf } from './field.ts'
import type { Blob } from './lifecycle.ts'
import { blobCopy } from './lifecycle.ts'
import { FilesBlob, M } from './model.ts'
import { pooled, settled } from './storage.ts'
import { attachmentOf, fieldOf, madeOf } from './upload.ts'
import type { Keys, StoredFile } from './values.ts'
import { isRecord, runningOf, storedFile, storedJson } from './values.ts'

/** A file `files.refresh` left as it was, and why. */
export interface RefreshFailure {
	readonly id: string
	readonly error: string
}

/** What `files.refresh` did. */
export interface Refreshed {
	/** The files given a missing value, or whose row's copy was written again. */
	readonly refreshed: number
	readonly failed: readonly RefreshFailure[]
}

/** Files read at once, and bodies held at once (D-366). */
const pageSize = 100
const width = 4

type Variant = Pick<Blob, 'variantOf' | 'name' | 'key' | 'type' | 'size'>

/** A file as it is once its missing values are made. */
interface Whole {
	readonly blob: Blob
	readonly variants: readonly Variant[]
}

const changed = 'The file changed during the refresh; refresh it again.'
const rowChanged = new Error(
	'The row changed during the refresh; refresh it again.',
)

/** Only Master, so server code, refreshes; another caller is logged. */
function masterOnly(caller: Identity): void {
	if (isMaster(caller)) return
	const callerId = caller.kind === 'user' ? caller.user.id : null
	runningOf().logger.warn({ callerId }, 'A files refresh was refused.')
	throw new PublicError('ACCESS_DENIED', 'Only Master refreshes files.')
}

/** A body as the storage serves it: its own route, or its URL (D-366). */
async function bodyOf(key: string): Promise<Uint8Array> {
	const { storage } = runningOf()
	const url = storage.url(key)
	const response =
		storage.serve === undefined
			? await fetch(url)
			: await storage.serve(key, new URL(url))
	if (response.status === 404) {
		throw new Error('The file is not in the storage.')
	}
	if (!response.ok) {
		throw new Error(`The storage answered ${response.status}.`)
	}
	return new Uint8Array(await response.arrayBuffer())
}

const inlineOf = (blob: Blob): { readonly [key: string]: unknown } =>
	isRecord(blob.inline) ? blob.inline : {}

/** The field's keys a file's blob, or a row's copy of it, lacks. */
function lacking(
	keys: Keys,
	inline: object,
	variants: readonly string[],
): Keys {
	return {
		inline: keys.inline.filter((key) => !Object.hasOwn(inline, key)),
		variants: keys.variants.filter((key) => !variants.includes(key)),
	}
}

const none = ({ inline, variants }: Keys): boolean =>
	inline.length === 0 && variants.length === 0

/**
 * Stores made variants as an upload does: their rows, as their file's, then
 * their objects. When the file changed meanwhile, its new variants follow
 * it, deleted with a file gone or released, and the refresh fails.
 */
async function stored(
	blob: Blob,
	made: readonly (readonly [string, Uint8Array, string])[],
): Promise<readonly Variant[]> {
	if (made.length === 0) return []
	const { storage } = runningOf()
	const { field, uploadedBy, state, attachedTo, deleteAfter } = blob
	const prefix = blob.key.slice(0, blob.key.indexOf('/'))
	const rows = made.map(([name, body, type]) => ({
		field,
		uploadedBy,
		state,
		attachedTo,
		deleteAfter,
		key: `${prefix}/${randomUUID()}`,
		name,
		type,
		size: body.length,
		variantOf: blob.id,
	}))
	await FilesBlob.createMany({ data: rows }, M)
	const where = { key: { in: rows.map(({ key }) => key) } }
	const removed = async () => {
		await Promise.all(rows.map(async ({ key }) => storage.delete(key)))
		await FilesBlob.deleteMany({ where }, M)
	}
	try {
		await settled(
			rows.map(async ({ key, type, size }, at) => {
				const body = made[at]?.[1] ?? new Uint8Array()
				const attachment = await attachmentOf(body, type)
				await storage.put(key, body, { type, size, attachment })
			}),
		)
	} catch (error) {
		await removed()
		throw error
	}
	const now = await FilesBlob.findUnique({ where: { id: blob.id } }, M)
	if (now?.state === state && now.attachedTo === attachedTo) return rows
	if (now === null || now.state === 'released') await removed()
	else {
		const data = {
			state: now.state,
			attachedTo: now.attachedTo,
			deleteAfter: now.deleteAfter,
		}
		await FilesBlob.updateMany({ where, data }, M)
	}
	throw new Error(changed)
}

/** A file with its missing inline values and variants made and stored. */
async function whole(
	options: FileOptions,
	blob: Blob,
	variants: readonly Variant[],
): Promise<Whole> {
	const inline = inlineOf(blob)
	const names = variants.map(({ name }) => name)
	const missing = lacking(keysOf(options), inline, names)
	if (none(missing)) return { blob, variants }
	const { name, type } = blob
	const body = await bodyOf(blob.key)
	const made = await madeOf(options, { body, type, name }, missing)
	const added = await stored(blob, made.variants)
	// Only missing keys are made, so no value the blob holds is replaced.
	const data = { inline: { ...inline, ...made.inline } }
	await FilesBlob.update({ where: { id: blob.id }, data }, M)
	return { blob: { ...blob, ...data }, variants: [...variants, ...added] }
}

/** The files a row's stored value holds: one, a list, or none. */
const heldIn = (value: unknown): readonly StoredFile[] =>
	(Array.isArray(value)
		? value
		: value === null || value === undefined
			? []
			: [value]
	).map((item: unknown) => storedFile(item, 'A file field'))

/**
 * Writes again the copies a row holds that lack a key, from their files, in
 * one write guarded by the row's `updatedAt` and value: the files it wrote,
 * or the files it did not because the row changed since it was read.
 */
async function rewritten(
	keys: Keys,
	row: StoredField,
	files: ReadonlyMap<string, Whole>,
): Promise<{ readonly ids: readonly string[]; readonly written: boolean }> {
	const held = heldIn(row.value)
	const stale = held.filter((copy) => {
		const missing = lacking(keys, copy.inline, Object.keys(copy.variants))
		return files.has(copy.id) && !none(missing)
	})
	const ids = stale.map(({ id }) => id)
	if (stale.length === 0) return { ids, written: true }
	const copies = held.map((copy) => {
		const file = files.get(copy.id)
		const fresh = stale.includes(copy) && file !== undefined
		return storedJson(fresh ? blobCopy(file.blob, file.variants) : copy)
	})
	const value = Array.isArray(row.value) ? copies : copies[0]
	return { ids, written: await row.write(value) }
}

/** One page of a field's files refreshed; gives the files it changed. */
async function refreshedPage(
	target: string,
	options: FileOptions,
	blobs: readonly Blob[],
	failed: RefreshFailure[],
): Promise<ReadonlySet<string>> {
	const fail = (id: string, error: unknown) => {
		const message = error instanceof Error ? error.message : String(error)
		failed.push({ id, error: message })
	}
	const ids = blobs.map(({ id }) => id)
	const where = { variantOf: { in: ids } }
	const variants = await FilesBlob.findMany({ where }, M)
	const holder = (blob: Blob): string | undefined =>
		blob.attachedTo?.startsWith(`${target}:`) === true
			? blob.attachedTo.slice(target.length + 1)
			: undefined
	const [model = '', field = ''] = target.split('.')
	const holders = blobs.flatMap((blob) => holder(blob) ?? [])
	// Read before the values are made, so a row written meanwhile is kept.
	const rows = await storedFields(model, field, [...new Set(holders)])
	const done = new Set<string>()
	const made = await pooled(blobs, width, async (blob) => {
		const own = variants.filter(({ variantOf }) => variantOf === blob.id)
		const file = await whole(options, blob, own)
		if (file.blob !== blob) done.add(blob.id)
		return file
	})
	const byRow = new Map<string, Map<string, Whole>>()
	for (const [at, outcome] of made.entries()) {
		const blob = blobs[at]
		if (blob === undefined) continue
		if (outcome.status === 'rejected') {
			fail(blob.id, outcome.reason)
			continue
		}
		const id = holder(blob)
		if (id === undefined) continue
		const files = byRow.get(id) ?? new Map<string, Whole>()
		byRow.set(id, files.set(blob.id, outcome.value))
	}
	const keys = keysOf(options)
	for (const [id, files] of byRow) {
		const row = rows.get(id)
		if (row === undefined) continue
		try {
			const { ids: copies, written } = await rewritten(keys, row, files)
			for (const file of copies) {
				if (written) done.add(file)
				else {
					done.delete(file)
					fail(file, rowChanged)
				}
			}
		} catch (error) {
			for (const file of files.keys()) {
				done.delete(file)
				fail(file, error)
			}
		}
	}
	return done
}

/**
 * Makes the inline values and variants the files of `target` lack, and
 * writes them in the copies their rows hold (D-366). Only Master calls it.
 */
export async function refresh(
	target: string,
	options: QueryOptions = {},
): Promise<Refreshed> {
	masterOnly(options.as ?? { kind: 'anonymous' })
	const field = fieldOf(target)
	const failed: RefreshFailure[] = []
	// The ids first, then the files a page at a time, so a file attached,
	// released or deleted meanwhile moves no other out of a page.
	const where = {
		field: target,
		variantOf: null,
		state: { in: ['pending', 'attached'] },
	}
	const all = await FilesBlob.findMany({ where, select: { id: true } }, M)
	let refreshed = 0
	for (let at = 0; at < all.length; at += pageSize) {
		const ids = all.slice(at, at + pageSize).map(({ id }) => id)
		const blobs = await FilesBlob.findMany(
			{ where: { AND: [where, { id: { in: ids } }] } },
			M,
		)
		refreshed += (await refreshedPage(target, field, blobs, failed)).size
	}
	if (failed.length > 0) {
		const { logger } = runningOf()
		logger.warn(
			{ field: target, failed: failed.length },
			'Files were not refreshed.',
		)
	}
	return { refreshed, failed }
}
