// An upload (D-152): its field, its size and its type checked, its pending
// `FilesBlob` row inserted as its caller, then its object stored. When it
// fails, its objects and its rows are deleted.
import { randomUUID } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import type { Identity, JsonValue } from 'ultimabase'
import { isMaster, PublicError } from 'ultimabase'
import type { FileInput, FileOptions, Inline } from './field.ts'
import { defaultMaxSize } from './field.ts'
import { bytesOf } from './memory.ts'
import { FilesBlob, hour, M } from './model.ts'
import type { FileBody } from './storage.ts'
import { settled } from './storage.ts'
import { runningOf } from './values.ts'

/** What an upload says of its file. */
export interface UploadOptions {
	/** The field the file is for: `Post.cover`. */
	readonly for: string
	readonly name: string
	/** The declared `Content-Type`, read only when the bytes say none. */
	readonly type?: string | undefined
	readonly as?: Identity | undefined
}

/** How many first bytes the type is read from, as `file-type` reads them. */
const sampleSize = 4100
/** An inline value's JSON, at most. */
const inlineSize = 2048

const invalid = (path: string, message: string): PublicError =>
	new PublicError('VALIDATION_FAILED', 'Invalid upload.', {
		details: { issues: [{ path: [path], message }] },
	})

function fieldOf(target: string): FileOptions {
	const [model = '', field = ''] = target.split('.')
	const options = runningOf().fields.get(model)?.get(field)
	if (options === undefined) {
		const message =
			target === ''
				? 'Expected a file field: Model.field.'
				: `${target} is not a file field.`
		throw invalid('for', message)
	}
	return options
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
	const bytes = new Uint8Array(length)
	let at = 0
	for (const chunk of chunks) {
		bytes.set(chunk, at)
		at += chunk.length
	}
	return bytes
}

/** The first bytes of a body, and the body to store, whole again. */
async function sampled(
	body: FileBody,
): Promise<{ readonly sample: Uint8Array; readonly body: FileBody }> {
	if (body instanceof Uint8Array) return { sample: body, body }
	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let length = 0
	while (length < sampleSize) {
		const { done, value } = await reader.read()
		if (done) {
			const whole = concat(chunks, length)
			return { sample: whole, body: whole }
		}
		chunks.push(value)
		length += value.length
	}
	const sample = concat(chunks, length)
	const rest = new ReadableStream<Uint8Array>({
		start: (controller) => {
			controller.enqueue(sample)
		},
		pull: async (controller) => {
			const { done, value } = await reader.read()
			if (done) controller.close()
			else controller.enqueue(value)
		},
		cancel: (reason) => reader.cancel(reason),
	})
	return { sample, body: rest }
}

const matches = (accept: readonly string[], type: string): boolean =>
	accept.some((pattern) =>
		pattern.endsWith('/*')
			? type.startsWith(pattern.slice(0, -1))
			: pattern === type,
	)

/** The type a file is stored with, and whether it is served as a download. */
async function typeOf(
	sample: Uint8Array,
	declared: string | undefined,
	accept: readonly string[] | undefined,
): Promise<{ readonly type: string; readonly attachment: boolean }> {
	const detected = (await fileTypeFromBuffer(sample))?.mime
	if (
		detected !== undefined &&
		(accept === undefined || matches(accept, detected))
	) {
		return { type: detected, attachment: detected === 'image/svg+xml' }
	}
	const [media = ''] = (declared ?? '').split(';')
	const type = media.trim().toLowerCase()
	if (detected === undefined && accept === undefined) {
		return {
			type: type === '' ? 'application/octet-stream' : type,
			attachment: true,
		}
	}
	// An undetected type is taken as declared only when accept lists it.
	if (detected === undefined && accept?.includes(type) === true) {
		return { type, attachment: true }
	}
	throw new PublicError(
		'UNSUPPORTED_MEDIA_TYPE',
		`${detected ?? (type === '' ? 'An undetected type' : type)} is not accepted.`,
	)
}

/** A variant's own type, served as a download unless its bytes say it. */
async function attachmentOf(body: Uint8Array, type: string): Promise<boolean> {
	const detected = (await fileTypeFromBuffer(body))?.mime
	return detected !== type || type === 'image/svg+xml'
}

async function inlineValue(
	key: string,
	given: Inline,
	file: FileInput,
): Promise<JsonValue> {
	const run = typeof given === 'function' ? given : given.run
	let value: unknown = await run(file)
	if (typeof given !== 'function') {
		const result = await given.schema['~standard'].validate(value)
		if (result.issues !== undefined) {
			throw new TypeError(`The inline ${key} does not match its schema.`)
		}
		value = result.value
	}
	const json = JSON.stringify(value)
	if (
		json === undefined ||
		new TextEncoder().encode(json).length > inlineSize
	) {
		throw new TypeError(`The inline ${key} is not JSON of 2 KB at most.`)
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse gives JSON.
	return JSON.parse(json) as JsonValue
}

const uploaderOf = (caller: Identity): string | null =>
	isMaster(caller) ? 'master' : caller.kind === 'user' ? caller.user.id : null

/** What a buffered upload made: its inline values and its variants. */
async function madeOf(
	options: FileOptions,
	file: FileInput,
): Promise<{
	readonly inline: { readonly [key: string]: JsonValue }
	readonly variants: readonly (readonly [string, Uint8Array, string])[]
}> {
	const inline = Object.entries(options.inline ?? {}).map(
		async ([key, given]) => [key, await inlineValue(key, given, file)] as const,
	)
	const variants = Object.entries(options.variants ?? {}).map(
		async ([key, variant]) => {
			const { body, type } = await variant(file)
			return [key, body, type] as const
		},
	)
	const [values, made] = await Promise.all([
		Promise.all(inline),
		Promise.all(variants),
	])
	return { inline: Object.fromEntries(values), variants: made }
}

/**
 * Stores a file for `options.for`, as `POST /files` does, and gives its id,
 * which a write of that field takes. `size` is the body's length in bytes.
 */
export async function upload(
	body: FileBody,
	size: number,
	options: UploadOptions,
): Promise<{ readonly id: string }> {
	const { name, as: caller = { kind: 'anonymous' } } = options
	const field = fieldOf(options.for)
	if (name === '') throw invalid('name', 'Expected a file name.')
	const maxSize = field.maxSize ?? defaultMaxSize
	if (size > maxSize) {
		throw new PublicError(
			'PAYLOAD_TOO_LARGE',
			`The file is over ${maxSize} bytes.`,
		)
	}
	const buffered = field.inline !== undefined || field.variants !== undefined
	const read = buffered
		? { sample: await bytesOf(body), body: undefined }
		: await sampled(body)
	const { type, attachment } = await typeOf(
		read.sample,
		options.type,
		field.accept,
	)
	const { storage, logger } = runningOf()
	const prefix = field.public === true ? 'public' : 'private'
	const keyOf = () => `${prefix}/${randomUUID()}`
	const uploadedBy = uploaderOf(caller)
	const deleteAfter = new Date(Date.now() + hour)
	const blob = { field: options.for, uploadedBy, state: 'pending', deleteAfter }
	const main = await FilesBlob.create(
		{ data: { ...blob, key: keyOf(), name, type, size } },
		{ as: caller },
	)
	const keys = [main.key]
	const ids = [main.id]
	try {
		if (read.body !== undefined) {
			await storage.put(main.key, read.body, { type, size, attachment })
			return { id: main.id }
		}
		const bytes = read.sample
		if (bytes.length !== size) {
			throw invalid('size', `The file has ${bytes.length} bytes, not ${size}.`)
		}
		const made = await madeOf(field, { body: bytes, type, name })
		const variants = await settled(
			made.variants.map(async ([key, variantBody, variantType]) => {
				const row = await FilesBlob.create(
					{
						data: {
							...blob,
							key: keyOf(),
							name: key,
							type: variantType,
							size: variantBody.length,
							variantOf: main.id,
						},
					},
					M,
				)
				keys.push(row.key)
				ids.push(row.id)
				return { row, body: variantBody }
			}),
		)
		await settled([
			storage.put(main.key, bytes, { type, size, attachment }),
			...variants.map(async ({ row, body: variantBody }) =>
				storage.put(row.key, variantBody, {
					type: row.type,
					size: row.size,
					attachment: await attachmentOf(variantBody, row.type),
				}),
			),
		])
		await FilesBlob.update(
			{ where: { id: main.id }, data: { inline: made.inline } },
			M,
		)
		return { id: main.id }
	} catch (error) {
		// The sweep deletes what this cannot: the rows expire within the hour.
		try {
			await Promise.all(keys.map((key) => storage.delete(key)))
			await FilesBlob.deleteMany({ where: { id: { in: ids } } }, M)
		} catch (cleanup) {
			logger.warn({ err: cleanup }, 'A failed upload was not cleaned up.')
		}
		throw error
	}
}
