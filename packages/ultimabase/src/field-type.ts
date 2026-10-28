// `defineFieldType` (D-32, D-122): a plugin's field type, stored through a
// kernel field and seen by code as the value its `decode` gives.
import type { Codec, FieldDefinition, FieldOptions } from './definition.ts'
import { build, fieldBuilders, fieldDefinitions } from './definition.ts'
import type {
	DefaultFunction,
	Described,
	Field,
	FieldBuilders,
	JsonValue,
	SchemaTypes,
	StandardSchema,
} from './fields.ts'
import type { fieldType } from './symbols.ts'
import { standardOf } from './validation.ts'

/** A kernel scalar field, as `stored` returns it. */
type Stored = {
	readonly [fieldType]: {
		readonly kind: 'scalar'
		readonly value: unknown
		readonly options: unknown
	}
}
type StoredValue<S> = S extends {
	readonly [fieldType]: { readonly value: infer V }
}
	? V
	: never
type StoredOptions<S> = S extends {
	readonly [fieldType]: { readonly options: infer O }
}
	? O
	: never

/** What `defineFieldType` takes (D-122). */
export type FieldTypeDefinition<P extends string, S, V, X> = {
	/** The plugin that provides the field type, which `plugins` lists (D-32). */
	readonly plugin: P
	/** The kernel field that stores, filters and indexes the value. */
	readonly stored: (f: FieldBuilders<never>) => S
	readonly decode: (stored: StoredValue<S>) => V
	readonly encode: (value: V) => StoredValue<S>
	/** Takes the value or its JSON, and gives the value. */
	readonly schema: X
	/** What a client reads. */
	readonly toJSON: (value: V) => JsonValue
}

/** A field type's options: the stored field says whether it may be `null`. */
export type FieldTypeOptions<I> = Described & {
	readonly default?: I | DefaultFunction<I>
}

/** The builder `defineFieldType` returns (D-122). */
export type FieldType<P extends string, S, V, I> = <
	const O extends FieldTypeOptions<I> = {},
>(
	options?: O,
) => Field<V, StoredOptions<S> & O, P, never, I, true, S>

const storedOptions = new Set(['list', 'optional', 'precision', 'scale'])

/** The stored field `stored` returns, a scalar with no rules. */
function storedOf(
	plugin: string,
	stored: unknown,
): FieldDefinition & { readonly kind: 'scalar' } {
	if (typeof stored !== 'function') {
		throw new TypeError(`defineFieldType(${plugin}): stored is a function.`)
	}
	const field: unknown = Reflect.apply(stored, undefined, [fieldBuilders])
	const definition =
		typeof field === 'object' && field !== null
			? fieldDefinitions.get(field)
			: undefined
	if (definition?.kind !== 'scalar' || definition.rules !== undefined) {
		throw new TypeError(
			`defineFieldType(${plugin}): stored returns a kernel scalar field, without .with.`,
		)
	}
	for (const option of Object.keys(definition.options)) {
		if (!storedOptions.has(option)) {
			throw new Error(
				`defineFieldType(${plugin}): the stored field takes list, optional, precision or scale only, not ${option}.`,
			)
		}
	}
	return definition
}

function functionOf(
	plugin: string,
	definition: { readonly [key: string]: unknown },
	key: string,
): (value: unknown) => unknown {
	const value = definition[key]
	if (typeof value !== 'function') {
		throw new TypeError(`defineFieldType(${plugin}): ${key} is a function.`)
	}
	return (given) => {
		const result: unknown = Reflect.apply(value, undefined, [given])
		return result
	}
}

/**
 * A plugin's field type (D-122): its builder takes `default` and
 * `description` only (D-150), and its
 * value is stored through `stored`, encoded after the hooks and decoded on
 * each read.
 */
export function defineFieldType<
	const P extends string,
	S extends Stored,
	V,
	X extends StandardSchema<unknown, V>,
>(
	definition: FieldTypeDefinition<P, S, V, X>,
): FieldType<P, S, V, SchemaTypes<X>['input']>
export function defineFieldType(definition: {
	readonly [key: string]: unknown
}): (options?: FieldOptions) => object {
	const plugin = definition['plugin']
	if (typeof plugin !== 'string' || plugin === '') {
		throw new TypeError('defineFieldType takes the name of its plugin.')
	}
	const stored = storedOf(plugin, definition['stored'])
	const schema = standardOf(definition['schema'])
	if (schema === undefined) {
		throw new TypeError(
			`defineFieldType(${plugin}): schema is a Standard Schema.`,
		)
	}
	const codec: Codec = Object.freeze({
		plugin,
		decode: functionOf(plugin, definition, 'decode'),
		encode: functionOf(plugin, definition, 'encode'),
		schema,
		toJSON: functionOf(plugin, definition, 'toJSON'),
	})
	return (options) => {
		for (const option of Object.keys(options ?? {})) {
			if (option !== 'default' && option !== 'description') {
				throw new Error(
					`A ${plugin} field takes default and description only, not ${option}: its stored field says the rest.`,
				)
			}
		}
		return build({
			...stored,
			options: { ...stored.options, ...options },
			codec,
		})
	}
}
