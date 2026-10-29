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

/** What `defineFieldType` takes (D-122), each function given the options. */
export type FieldTypeDefinition<P extends string, S, V, X, O extends object> = {
	/** The plugin that provides the field type, which `plugins` lists (D-32). */
	readonly plugin: P
	/** The names of the field type's own options, beside `default` (D-152). */
	readonly options?: readonly NoInfer<keyof O & string>[]
	/** The kernel field that stores, filters and indexes the value. */
	readonly stored: (f: FieldBuilders<never>, options: O) => S
	readonly decode: (stored: StoredValue<S>, options: O) => V
	readonly encode: (value: V, options: O) => StoredValue<S>
	/** Takes the value or its JSON, and gives the value. */
	readonly schema: X | ((options: O) => X)
	/** What a client reads. */
	readonly toJSON: (value: V, options: O) => JsonValue
	/** What `toJSON` gives, which types it for clients (D-152). */
	readonly shape?: StandardSchema | ((options: O) => StandardSchema)
}

/** A field type's options: the stored field says whether it may be `null`. */
export type FieldTypeOptions<I> = Described & {
	readonly default?: I | DefaultFunction<I>
}

/** The builder `defineFieldType` returns (D-122). */
export type FieldType<
	P extends string,
	S,
	V,
	I,
	// Weak, as `Described` is, so a name it lacks fails to compile.
	O extends object = Described,
> = <const G extends FieldTypeOptions<I> & Partial<O> = {}>(
	options?: G,
) => Field<V, StoredOptions<S> & G, P, never, I, true, S>

const storedOptions = new Set(['list', 'optional', 'precision', 'scale'])
const kernelOptions = new Set(['default', 'description'])
type Options = { readonly [key: string]: unknown }

/**
 * The stored field `stored` returns, a scalar with no rules; a value as its
 * default fills the rows stored before the field (D-152).
 */
function storedOf(
	plugin: string,
	stored: unknown,
	options: Options,
): FieldDefinition & { readonly kind: 'scalar' } {
	if (typeof stored !== 'function') {
		throw new TypeError(`defineFieldType(${plugin}): stored is a function.`)
	}
	const field: unknown = Reflect.apply(stored, undefined, [
		fieldBuilders,
		options,
	])
	const definition =
		typeof field === 'object' && field !== null
			? fieldDefinitions.get(field)
			: undefined
	if (definition?.kind !== 'scalar' || definition.rules !== undefined) {
		throw new TypeError(
			`defineFieldType(${plugin}): stored returns a kernel scalar field, without .with.`,
		)
	}
	for (const [option, value] of Object.entries(definition.options)) {
		const filled = option === 'default' && typeof value !== 'function'
		if (!storedOptions.has(option) && !filled) {
			throw new Error(
				`defineFieldType(${plugin}): the stored field takes list, optional, precision, scale or a value as its default only, not ${option}.`,
			)
		}
	}
	return definition
}

function functionOf(
	plugin: string,
	definition: Options,
	key: string,
	options: Options,
): (value: unknown) => unknown {
	const value = definition[key]
	if (typeof value !== 'function') {
		throw new TypeError(`defineFieldType(${plugin}): ${key} is a function.`)
	}
	return (given) => {
		const result: unknown = Reflect.apply(value, undefined, [given, options])
		return result
	}
}

/** One field's codec, its functions given that field's options. */
function codecOf(plugin: string, definition: Options, options: Options): Codec {
	const schemaOf = (key: string) => {
		const given = definition[key]
		const standard = standardOf(
			typeof given === 'function'
				? Reflect.apply(given, undefined, [options])
				: given,
		)
		if (standard === undefined) {
			throw new TypeError(
				`defineFieldType(${plugin}): ${key} is a Standard Schema.`,
			)
		}
		return standard
	}
	const shape =
		definition['shape'] === undefined ? undefined : schemaOf('shape').schema
	return Object.freeze({
		plugin,
		options,
		decode: functionOf(plugin, definition, 'decode', options),
		encode: functionOf(plugin, definition, 'encode', options),
		schema: schemaOf('schema'),
		toJSON: functionOf(plugin, definition, 'toJSON', options),
		...(shape === undefined ? {} : { shape }),
	})
}

/** The names a builder takes, `default`, `description` and the type's own. */
function namesOf(plugin: string, definition: Options): ReadonlySet<string> {
	const names = definition['options'] ?? []
	if (
		!Array.isArray(names) ||
		!names.every((name) => typeof name === 'string')
	) {
		throw new TypeError(
			`defineFieldType(${plugin}): options is a list of option names.`,
		)
	}
	return new Set([...kernelOptions, ...names])
}

/**
 * A plugin's field type (D-122): its builder takes `default`, `description`
 * (D-150) and the type's own options (D-152), and its value is stored through
 * `stored`, encoded after the hooks and decoded on each read.
 */
export function defineFieldType<
	const P extends string,
	S extends Stored,
	V,
	X extends StandardSchema<unknown, V>,
	O extends object = Described,
>(
	definition: FieldTypeDefinition<P, S, V, X, O>,
): FieldType<P, S, V, SchemaTypes<X>['input'], O>
export function defineFieldType(
	definition: Options,
): (options?: FieldOptions) => object {
	const plugin = definition['plugin']
	if (typeof plugin !== 'string' || plugin === '') {
		throw new TypeError('defineFieldType takes the name of its plugin.')
	}
	const names = namesOf(plugin, definition)
	// A definition fails at once, not at its first field.
	codecOf(plugin, definition, {})
	storedOf(plugin, definition['stored'], {})
	return (given = {}) => {
		const own: Record<string, unknown> = {}
		const kernel: Record<string, unknown> = {}
		for (const [option, value] of Object.entries(given)) {
			if (!names.has(option)) {
				throw new Error(
					names.size === kernelOptions.size
						? `A ${plugin} field takes default and description only, not ${option}: its stored field says the rest.`
						: `A ${plugin} field takes ${[...names].join(', ')} only, not ${option}.`,
				)
			}
			if (kernelOptions.has(option)) kernel[option] = value
			else own[option] = value
		}
		const options = Object.freeze(own)
		const stored = storedOf(plugin, definition['stored'], options)
		const { default: filled, ...rest } = stored.options
		const codec = codecOf(plugin, definition, options)
		return build({
			...stored,
			options: { ...rest, ...kernel },
			codec: filled === undefined ? codec : Object.freeze({ ...codec, filled }),
		})
	}
}
