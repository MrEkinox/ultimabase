// A model's files through its writes (D-152): ids resolved to files before
// the write, files attached and released in its transaction, released
// objects deleted after its commit, and the sweep for what a crash left.
import type { Caller } from 'ultimabase'
import { isMaster, PublicError } from 'ultimabase'
import type { FileOptions } from './field.ts'
import { keysOf } from './field.ts'
import { FilesBlob, M } from './model.ts'
import { settled } from './storage.ts'
import type { FileValue, StoredVariant } from './values.ts'
import { fileValue, isFile, Pending, runningOf, storedFile } from './values.ts'

type Blob = typeof FilesBlob extends {
	findMany(...args: never[]): Promise<(infer R)[]>
}
	? R
	: never
type BlobWhere = NonNullable<Parameters<typeof FilesBlob.findMany>[0]>['where']

/** What a hook gives of the write. */
interface Facts {
	readonly name: string
	readonly caller: Caller
	readonly record: object
}

const fieldsOf = (model: string): ReadonlyMap<string, FileOptions> =>
	runningOf().fields.get(model) ?? new Map<string, FileOptions>()

const invalid = (field: string, message: string): PublicError =>
	new PublicError('VALIDATION_FAILED', 'Invalid data.', {
		details: { issues: [{ path: [field], message }] },
	})

/** The files a field's value holds. */
function heldOf(value: unknown): readonly FileValue[] {
	const items: readonly unknown[] = Array.isArray(value) ? value : [value]
	return items.filter(isFile)
}

const idsOf = (record: object, field: string): readonly string[] =>
	heldOf(Reflect.get(record, field)).map(({ id }) => id)

const idOf = (record: object): string => String(Reflect.get(record, 'id'))

/** Whether `caller` may attach a pending blob: its uploader, or Master. */
function usable(blob: Blob, target: string, caller: Caller): boolean {
	const { state, field, variantOf, deleteAfter, uploadedBy } = blob
	return (
		state === 'pending' &&
		field === target &&
		variantOf === null &&
		deleteAfter !== null &&
		deleteAfter.getTime() > Date.now() &&
		(isMaster(caller) ||
			uploadedBy === null ||
			(caller.kind === 'user' && uploadedBy === caller.user.id))
	)
}

/** The pending files of `ids`, each one the caller may attach to `target`. */
async function pendingFiles(
	target: string,
	options: FileOptions,
	ids: readonly string[],
	caller: Caller,
): Promise<ReadonlyMap<string, FileValue>> {
	if (ids.length === 0) return new Map()
	const field = target.slice(target.indexOf('.') + 1)
	const where = { id: { in: ids } }
	const blobs = await FilesBlob.findMany({ where }, M)
	const missing = ids.find(
		(id) =>
			!blobs.some((blob) => blob.id === id && usable(blob, target, caller)),
	)
	if (missing !== undefined) {
		throw invalid(field, `${missing} is not a file uploaded for ${target}.`)
	}
	const made = await FilesBlob.findMany({ where: { variantOf: where.id } }, M)
	const keys = keysOf(options)
	return new Map(
		blobs.map((blob) => {
			const variants: { [key: string]: StoredVariant } = {}
			for (const { variantOf, name, key, type, size } of made) {
				if (variantOf === blob.id) variants[name] = { key, type, size }
			}
			const { id, key, name, type, size, inline } = blob
			const copy = { id, key, name, type, size, inline: inline ?? {}, variants }
			return [id, fileValue(storedFile(copy, 'FilesBlob'), keys)] as const
		}),
	)
}

/** A field's files after a write's operation on the ones it holds. */
async function filesOf(
	target: string,
	options: FileOptions,
	pending: Pending,
	held: readonly FileValue[],
	caller: Caller,
): Promise<readonly FileValue[]> {
	const { operation, ids } = pending
	const holds = new Map(held.map((file) => [file.id, file]))
	if (operation === 'remove') return held.filter(({ id }) => !ids.includes(id))
	const field = target.slice(target.indexOf('.') + 1)
	const taken = ids.find((id) => holds.has(id))
	if (operation === 'push' && taken !== undefined) {
		throw invalid(field, `The list holds ${taken} already.`)
	}
	const given =
		operation === 'pushUnique'
			? [...new Set(ids)].filter((id) => !holds.has(id))
			: ids
	const fresh = given.filter((id) => !holds.has(id))
	const found = await pendingFiles(target, options, fresh, caller)
	const listed = given.flatMap((id) => {
		const file = holds.get(id) ?? found.get(id)
		return file === undefined ? [] : [file]
	})
	return operation === 'set' ? listed : [...held, ...listed]
}

/**
 * `beforeCreate` and `beforeUpdate`: each file field's ids become its
 * files, computed on the row the update locked.
 */
export async function resolve(facts: {
	readonly name: string
	readonly caller: Caller
	readonly data: object
	readonly record?: object
}): Promise<void> {
	const { name, caller, data, record } = facts
	for (const [field, options] of fieldsOf(name)) {
		const value: unknown = Reflect.get(data, field)
		if (!(value instanceof Pending)) continue
		const held = record === undefined ? [] : heldOf(Reflect.get(record, field))
		const target = `${name}.${field}`
		const files = await filesOf(target, options, value, held, caller)
		Reflect.set(data, field, options.list === true ? files : files[0])
	}
}

const attached = (name: string, field: string, record: object): string =>
	`${name}.${field}:${idOf(record)}`

/**
 * `afterCreate` and `afterUpdate`: the files the row gained are attached,
 * with their variants, and the ones it lost released.
 */
export async function attach(
	facts: Facts & { readonly previous?: object },
): Promise<void> {
	const { name, record, previous } = facts
	for (const field of fieldsOf(name).keys()) {
		const now = idsOf(record, field)
		const before = previous === undefined ? [] : idsOf(previous, field)
		const gained = now.filter((id) => !before.includes(id))
		const lost = before.filter((id) => !now.includes(id))
		const attachedTo = attached(name, field, record)
		const data = { state: 'attached', attachedTo, deleteAfter: null }
		if (gained.length > 0) {
			const ids = { in: gained }
			const where = {
				id: ids,
				state: 'pending',
				deleteAfter: { gt: new Date() },
			}
			const { count } = await FilesBlob.updateMany({ where, data }, M)
			// The sweep released it, or another row attached it, since.
			if (count !== gained.length) {
				throw invalid(field, 'A file expired or was attached elsewhere.')
			}
			await FilesBlob.updateMany({ where: { variantOf: ids }, data }, M)
		}
		if (lost.length > 0) {
			const where = { OR: [{ id: { in: lost } }, { variantOf: { in: lost } }] }
			await FilesBlob.updateMany({ where, data: { state: 'released' } }, M)
		}
	}
}

const heldBy = (name: string, record: object): NonNullable<BlobWhere> => ({
	attachedTo: {
		in: [...fieldsOf(name).keys()].map((field) =>
			attached(name, field, record),
		),
	},
})

/** `afterDelete`: every file of the row, released. */
export async function release({ name, record }: Facts): Promise<void> {
	const where = heldBy(name, record)
	await FilesBlob.updateMany({ where, data: { state: 'released' } }, M)
}

/**
 * Deletes the released blobs `where` names: their objects, then their rows.
 * A failure keeps the rows, which the sweep deletes later.
 */
async function purge(where: NonNullable<BlobWhere>): Promise<void> {
	const { storage, logger } = runningOf()
	try {
		const blobs = await FilesBlob.findMany(
			{ where: { AND: [where, { state: 'released' }] } },
			M,
		)
		if (blobs.length === 0) return
		await settled(blobs.map(({ key }) => storage.delete(key)))
		const ids = blobs.map(({ id }) => id)
		await FilesBlob.deleteMany({ where: { id: { in: ids } } }, M)
	} catch (error) {
		logger.warn({ err: error }, 'Released files were not deleted yet.')
	}
}

/** `afterUpdateCommit`: the objects of the files the row lost, deleted. */
export async function deleteLost(
	facts: Facts & { readonly previous: object },
): Promise<void> {
	const { name, record, previous } = facts
	const lost = [...fieldsOf(name).keys()].flatMap((field) => {
		const now = idsOf(record, field)
		return idsOf(previous, field).filter((id) => !now.includes(id))
	})
	if (lost.length === 0) return
	await purge({ OR: [{ id: { in: lost } }, { variantOf: { in: lost } }] })
}

/** `afterDeleteCommit`: the objects of a deleted row's files, deleted. */
export async function deleteHeld({ name, record }: Facts): Promise<void> {
	await purge(heldBy(name, record))
}

/**
 * The sweep: expired pending blobs are released, so no write attaches them,
 * then every released blob is deleted, what a crash left included.
 */
export async function sweep(): Promise<void> {
	const where = { state: 'pending', deleteAfter: { lt: new Date() } }
	await FilesBlob.updateMany({ where, data: { state: 'released' } }, M)
	await purge({})
}

/** What `files.check` found. */
export interface Checked {
	/** Objects without a row, deleted with `delete: true`. */
	readonly objects: readonly string[]
	/** Rows whose object is missing: an upload under way, or a lost object. */
	readonly rows: readonly string[]
}

/** Compares the storage's keys with `FilesBlob`. */
export async function check(options?: {
	readonly delete?: boolean
}): Promise<Checked> {
	const { storage } = runningOf()
	// The keys first: an upload inserts its row before its object, so an
	// object listed without a row is never one under way.
	const keys = await storage.keys()
	const blobs = await FilesBlob.findMany({ select: { key: true } }, M)
	const held = new Set(blobs.map(({ key }) => key))
	const stored = new Set(keys)
	const objects = keys.filter((key) => !held.has(key))
	const rows = blobs.map(({ key }) => key).filter((key) => !stored.has(key))
	if (options?.delete === true) {
		await settled(objects.map((key) => storage.delete(key)))
	}
	return { objects, rows }
}
