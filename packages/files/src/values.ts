// A file field's values (D-152): the copy of each file's metadata the row
// stores, the value code reads, and the ids a write takes until the plugin's
// hooks resolve them.
import type { CallerRule, JsonValue, Logger } from 'ultimabase'
import type { FileOptions } from './field.ts'
import type { FileStorage } from './storage.ts'

/** A variant as a client reads it. */
export interface FileVariant {
	readonly type: string
	readonly size: number
	readonly url: string
}

/** What a file field's value holds. */
export interface FileValue<
	I extends object = { readonly [key: string]: JsonValue | null },
	V extends object = { readonly [key: string]: FileVariant | null },
> {
	readonly id: string
	readonly name: string
	readonly type: string
	readonly size: number
	/** Stable for a public file, presigned for one hour for a private one. */
	readonly url: string
	readonly inline: I
	readonly variants: V
}

/** The copy of a variant's metadata the row stores. */
export interface StoredVariant {
	readonly key: string
	readonly type: string
	readonly size: number
}

/** The copy of a file's metadata the row stores; `FilesBlob` is the truth. */
export interface StoredFile {
	readonly id: string
	readonly key: string
	readonly name: string
	readonly type: string
	readonly size: number
	readonly inline: { readonly [key: string]: JsonValue }
	readonly variants: { readonly [key: string]: StoredVariant }
}

/** What a field's options say of its value's keys. */
export interface Keys {
	readonly inline: readonly string[]
	readonly variants: readonly string[]
}

/** How a write changes a field's files, before the hooks resolve it. */
export type Operation = 'set' | 'push' | 'pushUnique' | 'remove'

/** The ids a write gives, which the plugin's hooks resolve to files. */
export class Pending {
	readonly operation: Operation
	readonly ids: readonly string[]
	constructor(operation: Operation, ids: readonly string[]) {
		this.operation = operation
		this.ids = ids
	}
}

/** What the running application gives the plugin. */
export interface Running {
	readonly storage: FileStorage
	/** Who may upload; Master always may. */
	readonly upload: CallerRule
	/** The largest file of a field that sets no `maxSize`. */
	readonly maxSize: number
	/** Each model's file fields, with their options. */
	readonly fields: ReadonlyMap<string, ReadonlyMap<string, FileOptions>>
	readonly logger: Logger
}

// The running application's: one runs at a time in a process.
let running: Running | undefined

export function useRunning(given: Running | undefined): void {
	running = given
}

export function runningOf(): Running {
	if (running === undefined) throw new Error('filesPlugin has not started.')
	return running
}

/** Each value code holds, with the copy the row stores. */
const copies = new WeakMap<object, StoredFile>()

/** The value code reads of a file, its URLs signed now. */
export function fileValue(stored: StoredFile, keys: Keys): FileValue {
	const { storage } = runningOf()
	const variants: { [key: string]: FileVariant | null } = {}
	for (const key of keys.variants) {
		const variant = stored.variants[key]
		variants[key] =
			variant === undefined
				? null
				: Object.freeze({
						type: variant.type,
						size: variant.size,
						url: storage.url(variant.key),
					})
	}
	const inline: { [key: string]: JsonValue | null } = {}
	for (const key of keys.inline) inline[key] = stored.inline[key] ?? null
	const value: FileValue = Object.freeze({
		id: stored.id,
		name: stored.name,
		type: stored.type,
		size: stored.size,
		url: storage.url(stored.key),
		inline: Object.freeze(inline),
		variants: Object.freeze(variants),
	})
	copies.set(value, stored)
	return value
}

/** Whether a value is a file the plugin resolved. */
export const isFile = (value: unknown): value is FileValue =>
	typeof value === 'object' && value !== null && copies.has(value)

/** The copy the row stores of a value code holds. */
export function copyOf(value: unknown, where: string): StoredFile {
	const copy =
		typeof value === 'object' && value !== null ? copies.get(value) : undefined
	if (copy === undefined) {
		throw new TypeError(
			`${where}: a file field stores the files filesPlugin resolved, written as ids.`,
		)
	}
	return copy
}

const isRecord = (value: unknown): value is { [key: string]: unknown } =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'
const isSize = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0

function variantsOf(
	value: unknown,
): { readonly [key: string]: StoredVariant } | undefined {
	if (!isRecord(value)) return undefined
	const variants: { [key: string]: StoredVariant } = {}
	for (const [name, variant] of Object.entries(value)) {
		if (!isRecord(variant)) return undefined
		const { key, type, size } = variant
		if (!isString(key) || !isString(type) || !isSize(size)) return undefined
		variants[name] = { key, type, size }
	}
	return variants
}

/** A stored copy, read back from the row; any other value is a bug. */
export function storedFile(value: unknown, where: string): StoredFile {
	if (isRecord(value)) {
		const { id, key, name, type, size, inline } = value
		const variants = variantsOf(value['variants'])
		if (
			isString(id) &&
			isString(key) &&
			isString(name) &&
			isString(type) &&
			isSize(size) &&
			isRecord(inline) &&
			variants !== undefined
		) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the row's JSON column holds JSON.
			const json = inline as { readonly [key: string]: JsonValue }
			return { id, key, name, type, size, inline: json, variants }
		}
	}
	throw new TypeError(`${where}: the row holds a file that is not one.`)
}

/** A copy as the row's JSON column stores it. */
export const storedJson = (copy: StoredFile): JsonValue => ({
	id: copy.id,
	key: copy.key,
	name: copy.name,
	type: copy.type,
	size: copy.size,
	inline: copy.inline,
	variants: Object.fromEntries(
		Object.entries(copy.variants).map(([name, { key, type, size }]) => [
			name,
			{ key, type, size },
		]),
	),
})

/** A value as a client reads it. */
export const fileJson = (value: FileValue): JsonValue => ({
	id: value.id,
	name: value.name,
	type: value.type,
	size: value.size,
	url: value.url,
	inline: { ...value.inline },
	variants: Object.fromEntries(
		Object.entries(value.variants).map(([name, variant]) => [
			name,
			variant === null
				? null
				: { type: variant.type, size: variant.size, url: variant.url },
		]),
	),
})
