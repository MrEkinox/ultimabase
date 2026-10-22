// What `defineModel`, the field builders and `definePlugin` record at run
// time: the values behind the types.
import type { ScalarType } from './adapter.ts'
import type { Manifest } from './plugin.ts'

export type FieldOptions = { readonly [option: string]: unknown }

/** A field as its builder recorded it. */
export type FieldDefinition =
	| {
			readonly kind: 'scalar'
			readonly type: ScalarType
			readonly values?: readonly string[]
			readonly options: FieldOptions
			readonly rules?: object
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
	readonly start: Function | undefined
	readonly stop: Function | undefined
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

export const fieldDefinitions: WeakMap<object, FieldDefinition> = new WeakMap()
export const modelDefinitions: WeakMap<object, ModelDefinition> = new WeakMap()
/** The application values `plugin()` returned. */
export const pluginValues: WeakMap<object, PluginRecord> = new WeakMap()
/** The model entries `use()` returned. */
export const pluginEntries: WeakMap<object, PluginRecord> = new WeakMap()

function build(definition: FieldDefinition): object {
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

const scalar =
	(type: ScalarType) =>
	(options?: FieldOptions): object =>
		build({ kind: 'scalar', type, options: options ?? {} })

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
	return build({
		kind: 'scalar',
		type: 'enum',
		values: strings,
		options: options ?? {},
	})
}

/** The builders `defineModel`'s `fields` callback receives (D-09, D-12). */
export const fieldBuilders: object = Object.freeze({
	string: scalar('string'),
	number: scalar('number'),
	boolean: scalar('boolean'),
	date: scalar('date'),
	json: scalar('json'),
	enumOf,
	one: relation('one'),
	many: relation('many'),
})
