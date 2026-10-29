// `file(options)` (D-152): a field of one file or a list of them, stored as a
// JSON copy of their metadata. A write gives ids, which the plugin's hooks
// resolve; a read gives each file's URL, signed through the running storage.
import type { Field, JsonValue } from 'ultimabase'
import type { StandardSchema } from './standard.ts'
import { defineFieldType } from 'ultimabase'
import { shapeOf } from './shape.ts'
import type { FileValue, FileVariant, Keys, Operation } from './values.ts'
import {
	copyOf,
	fileJson,
	fileValue,
	Pending,
	storedFile,
	storedJson,
} from './values.ts'

/** What `inline` and `variants` are made from, at upload. */
export interface FileInput {
	readonly body: Uint8Array
	readonly type: string
	readonly name: string
}

/** Computes one inline value: JSON of 2 KB at most. */
export type InlineRun = (file: FileInput) => JsonValue | Promise<JsonValue>
/** An inline value; with its `schema`, the transports type it. */
export type Inline =
	InlineRun | { readonly run: InlineRun; readonly schema: StandardSchema }

/** Another file made from the upload: a thumbnail. */
export type Variant = (file: FileInput) => MadeVariant | Promise<MadeVariant>
export interface MadeVariant {
	readonly body: Uint8Array
	readonly type: string
}

/** What `file()` takes (D-152). */
export interface FileOptions {
	readonly description?: string
	/** A single file that may be `null`. */
	readonly optional?: boolean
	/** A list of files, `[]` when empty. */
	readonly list?: boolean
	/** In bytes, 50 MB by default. */
	readonly maxSize?: number
	/** MIME types or patterns: `['image/*', 'application/pdf']`; any by default. */
	readonly accept?: readonly string[]
	/** Served to everyone at a stable URL; presigned for one hour otherwise. */
	readonly public?: boolean
	readonly inline?: { readonly [key: string]: Inline }
	readonly variants?: { readonly [key: string]: Variant }
}

type InlineOf<T> = T extends {
	readonly schema: StandardSchema<unknown, infer O>
}
	? O
	: T extends (...args: never[]) => infer R
		? Awaited<R>
		: never
type Inlines<O> = O extends { readonly inline: infer I }
	? { readonly [K in keyof I]: InlineOf<I[K]> | null }
	: { readonly [K in never]: never }
type Variants<O> = O extends { readonly variants: infer V }
	? { readonly [K in keyof V]: FileVariant | null }
	: { readonly [K in never]: never }
/** The value of a field with options `O`. */
export type FileOf<O> = FileValue<Inlines<O>, Variants<O>>
type ValueOf<O> = O extends { readonly list: true }
	? readonly FileOf<O>[]
	: FileOf<O>
type Ids = string | readonly string[]
/** A list's write: the new list, or one operation, as kernel lists (D-149). */
type ListInput =
	| readonly string[]
	| {
			readonly [K in Operation]: { readonly [P in K]: Ids } & {
				readonly [P in Exclude<Operation, K>]?: never
			}
	  }[Operation]
type InputOf<O> = O extends { readonly list: true } ? ListInput : string

/** A file field: read as files, written as ids. */
export type FileField<O> = Field<
	ValueOf<O>,
	O,
	'files',
	never,
	InputOf<O>,
	true,
	Field<JsonValue, O, never, never, JsonValue, true>
>

/** 50 MB. */
export const defaultMaxSize: number = 50 * 1024 * 1024
const operations: readonly Operation[] = ['set', 'push', 'pushUnique', 'remove']

export const keysOf = (options: FileOptions): Keys => ({
	inline: Object.keys(options.inline ?? {}),
	variants: Object.keys(options.variants ?? {}),
})

/** Ids, each once; `undefined` when the value is not a list of them. */
function idsOf(value: unknown, unique: boolean): readonly string[] | undefined {
	const ids: unknown[] = Array.isArray(value) ? value : [value]
	if (!ids.every((id): id is string => typeof id === 'string' && id !== '')) {
		return undefined
	}
	if (unique && new Set(ids).size !== ids.length) return undefined
	return ids
}

/** The ids a write gives, as the hooks resolve them. */
function pendingOf(value: unknown, list: boolean): Pending | string {
	if (!list) {
		return typeof value === 'string' && value !== ''
			? new Pending('set', [value])
			: 'Expected a file id.'
	}
	const expected =
		'Expected a list of file ids, each once, or one of set, push, pushUnique, remove.'
	if (Array.isArray(value)) {
		const ids = idsOf(value, true)
		return ids === undefined ? expected : new Pending('set', ids)
	}
	if (typeof value !== 'object' || value === null) return expected
	const given = Object.entries(value).filter(([, ids]) => ids !== undefined)
	const [entry] = given
	const operation = operations.find((name) => name === entry?.[0])
	if (given.length !== 1 || operation === undefined) return expected
	const ids = idsOf(entry?.[1], operation === 'set' || operation === 'push')
	return ids === undefined ? expected : new Pending(operation, ids)
}

const schemaOf = (options: FileOptions): StandardSchema<unknown, Pending> => ({
	'~standard': {
		version: 1,
		vendor: 'ultimabase-files',
		validate: (value) => {
			const pending = pendingOf(value, options.list === true)
			return typeof pending === 'string'
				? { issues: [{ message: pending }] }
				: { value: pending }
		},
	},
})

type Value = FileValue | readonly FileValue[] | Pending

const isList = (value: Value): value is readonly FileValue[] =>
	Array.isArray(value)

const fileType = defineFieldType({
	plugin: 'files',
	options: [
		'optional',
		'list',
		'maxSize',
		'accept',
		'public',
		'inline',
		'variants',
	],
	stored: (f, options: FileOptions) =>
		options.list === true
			? f.json({ default: [] })
			: options.optional === true
				? f.json({ optional: true })
				: f.json(),
	decode: (stored, options): Value => {
		const keys = keysOf(options)
		const where = 'A file field'
		return Array.isArray(stored)
			? stored.map((item) => fileValue(storedFile(item, where), keys))
			: fileValue(storedFile(stored, where), keys)
	},
	encode: (value: Value): JsonValue => {
		const where = 'A file field'
		if (value instanceof Pending) copyOf(value, where)
		return isList(value)
			? value.map((item) => storedJson(copyOf(item, where)))
			: storedJson(copyOf(value, where))
	},
	schema: (options: FileOptions): StandardSchema<unknown, Value> =>
		schemaOf(options),
	toJSON: (value): JsonValue => {
		if (value instanceof Pending) return null
		return isList(value) ? value.map((item) => fileJson(item)) : fileJson(value)
	},
	shape: (options) => shapeOf(options),
})

function checked(options: FileOptions): void {
	const { list, optional, maxSize, accept } = options
	if (list === true && optional === true) {
		throw new Error('A file list is empty, never null: list or optional.')
	}
	if (maxSize !== undefined && (!Number.isInteger(maxSize) || maxSize <= 0)) {
		throw new Error('A file field’s maxSize is a number of bytes.')
	}
	if (accept?.some((type) => !/^[\w.+-]+\/(\*|[\w.+-]+)$/.test(type))) {
		throw new Error(
			'A file field’s accept lists MIME types or patterns: image/png, image/*.',
		)
	}
	for (const [key, inline] of Object.entries(options.inline ?? {})) {
		if (typeof inline !== 'function' && typeof inline?.run !== 'function') {
			throw new Error(`A file field’s inline ${key} is a function.`)
		}
	}
	for (const [key, variant] of Object.entries(options.variants ?? {})) {
		if (typeof variant !== 'function') {
			throw new Error(`A file field’s variant ${key} is a function.`)
		}
	}
}

/**
 * A field of files (D-152): written as ids from `POST /files` or
 * `files.upload`, read with each file's URL.
 */
export function file(): FileField<{}>
// Neither a default for `O` nor inference from where the field goes: either
// would leave the functions of `inline` and `variants` untyped.
export function file<const O extends FileOptions>(
	options: O,
): FileField<NoInfer<O>>
export function file(options?: FileOptions): FileField<FileOptions> {
	const given: FileOptions = options ?? {}
	checked(given)
	const field =
		given.list === true ? fileType({ ...given, default: [] }) : fileType(given)
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field's options give its value and its input.
	return field as unknown as FileField<FileOptions>
}
