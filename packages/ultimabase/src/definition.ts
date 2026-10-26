// What `defineModel`, the field builders and `definePlugin` record at run
// time: the values behind the types.
import type { ScalarType } from './adapter.ts'
import type { StandardSchema } from './fields.ts'
import type { Manifest, OutputForm } from './plugin.ts'
import type { Standard } from './validation.ts'

export type FieldOptions = { readonly [option: string]: unknown }

/** What a plugin field type adds to its stored field (D-122). */
export type Codec = {
	readonly plugin: string
	readonly decode: (stored: unknown) => unknown
	readonly encode: (value: unknown) => unknown
	readonly schema: Standard
	readonly toJSON: (value: unknown) => unknown
}

/** A field as its builder recorded it. */
export type FieldDefinition =
	| {
			readonly kind: 'scalar'
			readonly type: ScalarType
			readonly values?: readonly string[]
			readonly options: FieldOptions
			readonly rules?: object
			/** A plugin field type's, whose `type` is the stored one (D-122). */
			readonly codec?: Codec
	  }
	| {
			readonly kind: 'one' | 'many'
			readonly target: () => unknown
			readonly options: FieldOptions
			readonly rules?: object
	  }

export type IndexDefinition = {
	readonly fields: readonly string[]
	readonly unique?: boolean
}

export type ModelDefinition = {
	readonly name: string
	readonly dbName: string | undefined
	readonly fields: ReadonlyMap<string, FieldDefinition>
	readonly indexes: readonly IndexDefinition[]
	/** The plugins of its `use`, in that order (D-89). */
	readonly uses: readonly PluginUse[]
	/** What `.with` received, once (D-07). */
	rules: object | undefined
}

/** A plugin's code, as `definePlugin` checked it (D-57, D-89). */
export type PluginCode = {
	readonly name: string
	readonly manifest: Manifest
	readonly requires: readonly string[]
	readonly optional: readonly string[]
	readonly hooks: { readonly [hook: string]: Function | undefined }
	readonly redirect: Function | undefined
	readonly commands: Function | undefined
	readonly api: Function | undefined
	readonly addedFields: Function | undefined
	/** The indexes it adds to the models that use it (D-122). */
	readonly addedIndexes: readonly IndexDefinition[]
	readonly start: Function | undefined
	readonly stop: Function | undefined
	/** Who sends a request, if the plugin knows it (D-112). */
	readonly identify: Function | undefined
	/** The keys it gives a user caller (D-121). */
	readonly caller: Function | undefined
	/** Its own models, which no plugin is given (D-110). */
	readonly models: readonly unknown[]
	/** Builds its functions when the application starts (D-113). */
	readonly functions: Function | undefined
	/** The APIs of the plugins it needs, read when used (D-89). */
	readonly plugins: object
}

/** A plugin's entry in `use`, or its value in `plugins`, with its options. */
export type PluginRecord = {
	readonly code: PluginCode
	readonly options: object
}

/** A plugin in a model's `use`, and what its code gets of the model. */
export type PluginUse = {
	readonly code: PluginCode
	readonly model: {
		readonly queries: object
		readonly options: object
		readonly plugins: object
	}
}

/** A model or a type, as an output holds it (D-109). */
export type NamedOutput =
	| {
			readonly kind: 'model'
			/** The `defineModel` value. */
			readonly value: object
			readonly name: string
	  }
	| { readonly kind: 'type'; readonly type: TypeDefinition }

/** A function's or a type's output, as the kernel reads it (D-109). */
export type Output =
	| { readonly kind: 'schema'; readonly schema: StandardSchema }
	| (NamedOutput & { readonly form: OutputForm })

export type TypeDefinition = {
	readonly name: string
	readonly fields: ReadonlyMap<string, Output>
}

export type FunctionDefinition = {
	readonly name: string
	readonly query: boolean
	readonly input: StandardSchema | undefined
	readonly output: Output | undefined
	/** The plugins of its `use` (D-27). */
	readonly uses: readonly PluginRecord[]
	readonly run: Function
	/** What `.with` received, once. */
	rules: object | undefined
}

export const fieldDefinitions: WeakMap<object, FieldDefinition> = new WeakMap()
export const modelDefinitions: WeakMap<object, ModelDefinition> = new WeakMap()
/** The application values `plugin()` returned. */
export const pluginValues: WeakMap<object, PluginRecord> = new WeakMap()
/** The model entries `use()` returned. */
export const pluginEntries: WeakMap<object, PluginRecord> = new WeakMap()
export const typeDefinitions: WeakMap<object, TypeDefinition> = new WeakMap()
export const functionDefinitions: WeakMap<object, FunctionDefinition> =
	new WeakMap()
/** What each `X.nullable()` returned stands for (D-109). */
export const nullables: WeakMap<object, NamedOutput> = new WeakMap()

/** `X.nullable()`, for a model or a type. */
export function nullable(named: NamedOutput): object {
	const marker = Object.freeze({})
	nullables.set(marker, named)
	return marker
}

/** A field value, keyed by its definition; `.with` takes its rules once. */
export function build(definition: FieldDefinition): object {
	const field = {
		with: (rules: object): object => {
			if (definition.rules !== undefined) {
				throw new Error('A field takes its rules in one `.with`.')
			}
			return build({ ...definition, rules })
		},
	}
	fieldDefinitions.set(field, definition)
	return field
}

/** A field that `list: true` makes a list (D-120, D-127). */
function listable(
	type: ScalarType,
	options: FieldOptions = {},
	values?: readonly string[],
): object {
	if (options['list'] === true) {
		if (options['optional'] !== undefined) {
			throw new Error(
				'A list is never null: left out, it is []. Remove optional.',
			)
		}
		if (options['unique'] !== undefined) {
			throw new Error('A list cannot be unique.')
		}
	}
	return build({
		kind: 'scalar',
		type,
		...(values === undefined ? {} : { values }),
		options,
	})
}

/** A field no list holds yet (D-127). */
const scalar =
	(type: ScalarType) =>
	(options?: FieldOptions): object => {
		if (options?.['list'] !== undefined) {
			throw new Error(
				`f.${type}() makes no list: a list holds strings, numbers or enum values.`,
			)
		}
		return build({ kind: 'scalar', type, options: options ?? {} })
	}

const relation =
	(kind: 'one' | 'many') =>
	(target: () => unknown, options?: FieldOptions): object =>
		build({ kind, target, options: options ?? {} })

function enumOf(values: readonly unknown[], options?: FieldOptions): object {
	const strings = values.filter((value) => typeof value === 'string')
	if (strings.length === 0 || strings.length !== values.length) {
		throw new Error('enumOf takes a list of strings.')
	}
	if (new Set(strings).size !== strings.length) {
		throw new Error(`enumOf lists a value twice: ${strings.join(', ')}.`)
	}
	return listable('enum', options, strings)
}

/** The builders `defineModel`'s `fields` callback receives (D-09, D-12). */
export const fieldBuilders: object = Object.freeze({
	string: (options?: FieldOptions) => listable('string', options),
	number: (options?: FieldOptions) => listable('number', options),
	boolean: scalar('boolean'),
	date: scalar('date'),
	json: scalar('json'),
	enumOf,
	one: relation('one'),
	many: relation('many'),
})
