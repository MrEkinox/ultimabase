// What `defineModel`, the field builders and `definePlugin` record at run
// time: the values behind the types.
import type { ScalarType } from './adapter.ts'
import type { Enum, StandardSchema } from './fields.ts'
import type { Manifest, OutputForm } from './plugin.ts'
import type { Standard } from './validation.ts'
import { Refused } from './errors.ts'
import { isObject } from './query-where.ts'
import { standardOf } from './validation.ts'

export type FieldOptions = { readonly [option: string]: unknown }

/** What a plugin field type adds to its stored field (D-122). */
export type Codec = {
	readonly plugin: string
	/** The field type's own options this field took (D-152). */
	readonly options: { readonly [key: string]: unknown }
	/** The stored value of the rows stored before the field (D-152). */
	readonly filled?: unknown
	readonly decode: (stored: unknown) => unknown
	readonly encode: (value: unknown) => unknown
	readonly schema: Standard
	readonly toJSON: (value: unknown) => unknown
	/** What `toJSON` gives, as a Standard Schema (D-152). */
	readonly shape?: StandardSchema
}

/** A field as its builder recorded it. */
export type FieldDefinition =
	| {
			readonly kind: 'scalar'
			readonly type: ScalarType
			readonly values?: readonly string[]
			/** The `defineEnum` its values are, if one (D-150). */
			readonly enum?: Enum
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
	| {
			/** Computed on read (D-151): its schema, or a thunk of its output. */
			readonly kind: 'virtual'
			readonly output: unknown
			readonly options: FieldOptions
			readonly rules?: object
	  }

export type IndexDefinition = {
	readonly fields: readonly string[]
	readonly unique?: boolean
	/** A trigram index, for `contains` and `mode: 'insensitive'` (D-141). */
	readonly contains?: true
	/** A unique index whose string fields ignore case (D-170). */
	readonly mode?: 'insensitive'
}

export type ModelDefinition = {
	readonly name: string
	readonly description: string | undefined
	readonly dbName: string | undefined
	readonly fields: ReadonlyMap<string, FieldDefinition>
	readonly indexes: readonly IndexDefinition[]
	/** The plugins of its `use`, in that order (D-89). */
	readonly uses: readonly PluginUse[]
	/** Its operations, which a field type's plugin is given (D-152). */
	readonly queries: object
	/** What `.with` received, once (D-07). */
	rules: object | undefined
}

/** A plugin's code, as `definePlugin` checked it (D-57, D-89). */
export type PluginCode = {
	readonly name: string
	readonly manifest: Manifest | undefined
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
	/** Takes what each commit changed (D-154). */
	readonly changed: Function | undefined
	readonly missed: Function | undefined
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
		readonly name: string
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
	readonly description: string | undefined
	readonly fields: ReadonlyMap<string, Output>
}

export type FunctionDefinition = {
	readonly name: string
	readonly description: string | undefined
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

/** The name a `define*` call takes: a non-empty string. */
export function nameOf(name: unknown, by: string): string {
	if (typeof name !== 'string' || name === '') {
		throw new Error(`${by} takes a name.`)
	}
	return name
}

/** A `description` (D-150): a non-empty string, when given. */
export function describedBy(
	description: unknown,
	of: string,
): string | undefined {
	if (description === undefined) return undefined
	if (typeof description !== 'string' || description === '') {
		throw new Error(`${of}: description is a non-empty string.`)
	}
	return description
}

/**
 * The `.with` of a model or a function: its rules, in one call, read when
 * they apply, so it returns the same value.
 */
export const withOnce =
	(name: string, record: { rules: object | undefined }, value: () => object) =>
	(rules: unknown): object => {
		if (record.rules !== undefined) {
			throw new Refused(`${name} takes its rules in one \`.with\`.`)
		}
		if (!isObject(rules)) throw new Refused(`${name}.with takes an object.`)
		record.rules = rules
		return value()
	}

/** A field value, keyed by its definition; `.with` takes its rules once. */
export function build(definition: FieldDefinition): object {
	describedBy(definition.options['description'], 'A field')
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
	shared?: Enum,
): object {
	const list = options['list'] === true
	if (list) {
		if (options['optional'] !== undefined) {
			throw new Error(
				'A list is never null: left out, it is []. Remove optional.',
			)
		}
		if (options['unique'] !== undefined) {
			throw new Error('A list cannot be unique.')
		}
	}
	if (options['unique'] === 'insensitive' && type !== 'string') {
		throw new Error("unique: 'insensitive' takes a string field.")
	}
	if (options['search'] !== undefined && (list || type !== 'string')) {
		throw new Error('search takes a string field that is not a list.')
	}
	return build({
		kind: 'scalar',
		type,
		...(values === undefined ? {} : { values }),
		...(shared === undefined ? {} : { enum: shared }),
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

const whole = (value: unknown, most: number): value is number =>
	Number.isInteger(value) && Number(value) >= 0 && Number(value) <= most

/** Exact numbers of `precision` digits, `scale` after the point (D-145). */
function decimal(options?: FieldOptions): object {
	const { precision, scale } = options ?? {}
	if (!whole(precision, 1000) || precision === 0) {
		throw new Error('f.decimal() takes a precision from 1 to 1000.')
	}
	if (!whole(scale, precision)) {
		throw new Error(
			`f.decimal() takes a scale from 0 to its precision, ${precision}.`,
		)
	}
	return scalar('decimal')(options)
}

const relation =
	(kind: 'one' | 'many') =>
	(target: () => unknown, options?: FieldOptions): object =>
		build({ kind, target, options: options ?? {} })

/** The `defineEnum` values, which `enumOf` takes in place of a list. */
export const sharedEnums: WeakMap<object, Enum> = new WeakMap()

/** An enum's values: strings, each once. */
export function enumValues(values: unknown, of: string): readonly string[] {
	const listed: readonly unknown[] = Array.isArray(values) ? values : []
	const strings = listed.filter((value) => typeof value === 'string')
	if (strings.length === 0 || strings.length !== listed.length) {
		throw new Error(`${of} takes a list of strings.`)
	}
	if (new Set(strings).size !== strings.length) {
		throw new Error(`${of} lists a value twice: ${strings.join(', ')}.`)
	}
	return strings
}

function enumOf(values: unknown, options?: FieldOptions): object {
	const shared = isObject(values) ? sharedEnums.get(values) : undefined
	if (shared !== undefined) {
		return listable('enum', options, shared.values, shared)
	}
	return listable('enum', options, enumValues(values, 'enumOf'))
}

/** The builders `defineModel`'s `fields` callback receives (D-09, D-12). */
export const fieldBuilders: object = Object.freeze({
	string: (options?: FieldOptions) => listable('string', options),
	number: (options?: FieldOptions) => listable('number', options),
	decimal,
	boolean: scalar('boolean'),
	dateTime: scalar('dateTime'),
	date: scalar('date'),
	json: scalar('json'),
	enumOf,
	one: relation('one'),
	many: relation('many'),
	virtual: (output: unknown, options?: FieldOptions): object =>
		build({ kind: 'virtual', output, options: options ?? {} }),
})

function namedOf(value: unknown): NamedOutput | undefined {
	if (!isObject(value)) return undefined
	const model = modelDefinitions.get(value)
	if (model !== undefined) return { kind: 'model', value, name: model.name }
	const type = typeDefinitions.get(value)
	return type === undefined ? undefined : { kind: 'type', type }
}

/** An output's value, read once at its definition (D-109). */
export function outputOf(value: unknown, where: string): Output {
	const standard = standardOf(value)
	if (standard !== undefined) return { kind: 'schema', schema: standard.schema }
	const named = namedOf(value)
	if (named !== undefined) return { ...named, form: 'one' }
	const marked = isObject(value) ? nullables.get(value) : undefined
	if (marked !== undefined) return { ...marked, form: 'nullable' }
	const list: readonly unknown[] = Array.isArray(value) ? value : []
	const listed = list.length === 1 ? namedOf(list[0]) : undefined
	if (listed !== undefined) return { ...listed, form: 'list' }
	throw new Refused(
		`${where} is a model, a type, a list of one, X.nullable() or a Standard Schema.`,
	)
}
