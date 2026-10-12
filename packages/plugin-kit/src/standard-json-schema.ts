import type { JsonValue } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

/** One JSON Schema (draft 2020-12) object. */
export type StandardJsonSchema = Readonly<Record<string, JsonValue>>

/** Narrows a value produced by a JSON Schema converter to plain JSON. */
const toJsonValue = (value: unknown): JsonValue | undefined => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value))
	) {
		return value
	}
	if (Array.isArray(value)) {
		const items: JsonValue[] = []
		for (const item of value) {
			const json = toJsonValue(item)
			if (json === undefined) return undefined
			items.push(json)
		}
		return items
	}
	if (!isPlainRecord(value)) return undefined
	const entries: [string, JsonValue][] = []
	for (const [key, item] of Object.entries(value)) {
		const json = toJsonValue(item)
		if (json === undefined) return undefined
		entries.push([key, json])
	}
	return Object.fromEntries(entries)
}

/**
 * Reads the JSON Schema (draft 2020-12) a Standard JSON Schema validator
 * (Zod, Valibot, ArkType…) gives of its input or output, without `$schema`;
 * `undefined` when the value is not such a validator or cannot describe
 * itself. REST (OpenAPI) and GraphQL derive their formats from it
 * (ADR-0324, ADR-0325).
 *
 * @example `readStandardJsonSchema(z.object({ title: z.string() }), 'input')`
 */
export const readStandardJsonSchema = (
	validator: unknown,
	direction: 'input' | 'output',
): StandardJsonSchema | undefined => {
	if (
		(typeof validator !== 'object' && typeof validator !== 'function') ||
		validator === null
	) {
		return undefined
	}
	const standard: unknown = Reflect.get(validator, '~standard')
	const converter: unknown = isPlainRecord(standard)
		? standard.jsonSchema
		: undefined
	if (
		(typeof converter !== 'object' && typeof converter !== 'function') ||
		converter === null
	) {
		return undefined
	}
	const convert: unknown = Reflect.get(converter, direction)
	if (typeof convert !== 'function') return undefined
	try {
		const schema = toJsonValue(
			Reflect.apply(convert, converter, [{ target: 'draft-2020-12' }]),
		)
		if (!isPlainRecord(schema)) return undefined
		// Documents declare their own dialect.
		return Object.fromEntries(
			Object.entries(schema).filter(([key]) => key !== '$schema'),
		)
	} catch {
		// A validator that cannot describe itself stays undocumented.
		return undefined
	}
}
