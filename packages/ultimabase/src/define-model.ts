// `defineModel` (D-07, D-12): the fields its callback and its plugins build,
// recorded for `start`, and the model value whose methods run the queries
// (D-18) and its plugins' commands (D-89).
import { fieldBuilders, modelDefinitions, nullable } from './definition.ts'
import type { FieldDefinition, ModelDefinition } from './definition.ts'
import { query } from './engine.ts'
import type { Operation } from './engine.ts'
import { addFields, usedBy } from './plugin-use.ts'
import type { FieldBuilders } from './fields.ts'
import type {
	FieldShape,
	IndexCheck,
	IndexShape,
	Model,
	RecordCheck,
	UniqueIndexFields,
} from './model.ts'
import type { ForModel, ModelUse, PluginTypes } from './plugin.ts'

// The intersection of the used plugins' commands; `unknown` without any.
type CommandFn<U, F> =
	U extends ModelUse<string, infer T>
		? T extends { readonly commands: object }
			? (value: ForModel<T, F>['commands']) => void
			: never
		: never
type Commands<U, F> = [CommandFn<U, F>] extends [never]
	? unknown
	: CommandFn<U, F> extends (value: infer I) => void
		? I
		: unknown

/** Each used plugin's key of `.with`, typed by the model's fields. */
type WithKeys<U, F> = {
	readonly [
		V in U as V extends ModelUse<infer P, infer T>
			? T extends { readonly with: object | false }
				? P
				: never
			: never
	]?: V extends ModelUse<
		string,
		infer T extends { readonly with: object | false }
	>
		? ForModel<T, F>['with']
		: never
}

/** The types of the plugins in a model's `use`. */
type UsedTypes<U> = U extends ModelUse<string, infer T> ? T : never

// The fields the used plugins add, merged with the model's own.
type AddFn<U> =
	U extends ModelUse<string, infer T>
		? T extends { readonly addedFields: infer A }
			? (value: A) => void
			: never
		: never
type Added<U> = [AddFn<U>] extends [never]
	? unknown
	: AddFn<U> extends (value: infer I) => void
		? I
		: unknown
type AllFields<F, U> = [Added<U>] extends [unknown]
	? unknown extends Added<U>
		? F
		: F & Added<U>
	: F & Added<U>

/** A model's fields, as `fields` returns them. */
export type FieldShapes = { readonly [field: string]: FieldShape }

/** The `fields` callback: its builders know the plugins of `use` (D-12, D-57). */
export type ModelFields<
	F,
	U extends readonly ModelUse<string, PluginTypes>[],
> = (fields: FieldBuilders<UsedTypes<U[number]>>) => F & NoInfer<RecordCheck<F>>

/**
 * The model a declaration with these fields and plugins builds; a plugin's
 * `define<Kind>` returns it with its own entry in `U` (D-13).
 */
export type ModelOf<
	N extends string,
	F,
	U extends readonly ModelUse<string, PluginTypes>[],
	X extends readonly IndexShape[] = [],
> = Model<
	N,
	AllFields<F, U[number]>,
	U[number]['plugin'],
	WithKeys<U[number], AllFields<F, U[number]>>,
	UniqueIndexFields<X>
> &
	Commands<U[number], AllFields<F, U[number]>>

/** `indexes`, whose fields are checked against the model's (D-52). */
export type ModelIndexes<
	X,
	F,
	U extends readonly ModelUse<string, PluginTypes>[],
> = X & NoInfer<IndexCheck<X, AllFields<F, U[number]>>>

export function defineModel<
	const N extends string,
	const F extends FieldShapes,
	const U extends readonly ModelUse<string, PluginTypes>[] = [],
	const X extends readonly IndexShape[] = [],
>(definition: {
	readonly name: N
	/** The stored table's or collection's name (D-63). */
	readonly dbName?: string
	readonly use?: U
	/** The only form (D-12). */
	readonly fields: ModelFields<F, U>
	readonly indexes?: ModelIndexes<X, F, U>
}): ModelOf<N, F, U, X> {
	const model = createModel({
		name: definition.name,
		dbName: definition.dbName,
		use: definition.use ?? [],
		fields: definition.fields,
		indexes: definition.indexes ?? [],
	})
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- createModel builds the value ModelOf describes; the types follow the definition.
	return model as unknown as ModelOf<N, F, U, X>
}

const operations: readonly Operation[] = [
	'findMany',
	'findFirst',
	'findUnique',
	'count',
	'create',
	'update',
	'delete',
]

function createModel(definition: {
	readonly name: unknown
	readonly dbName: unknown
	readonly use: readonly unknown[]
	readonly fields: Function
	readonly indexes: readonly IndexShape[]
}): object {
	const { name, dbName } = definition
	if (typeof name !== 'string' || name === '') {
		throw new Error('defineModel takes a name.')
	}
	if (dbName !== undefined && typeof dbName !== 'string') {
		throw new Error(`${name}: dbName must be a string.`)
	}
	const built: unknown = Reflect.apply(definition.fields, undefined, [
		fieldBuilders,
	])
	const fields = new Map<string, FieldDefinition>()
	addFields(name, built, fields, new Map())
	const queries: { [operation: string]: unknown } = {}
	for (const operation of operations) {
		queries[operation] = async (args?: unknown, options?: unknown) =>
			query(name, operation, args, options)
	}
	Object.freeze(queries)
	const { uses, commands } = usedBy(name, definition.use, fields, queries)
	const record: ModelDefinition = {
		name,
		dbName,
		fields,
		indexes: definition.indexes.map((index) => ({
			fields: [...index.fields],
			...(index.unique === undefined ? {} : { unique: index.unique }),
		})),
		uses,
		rules: undefined,
	}
	const model: { [key: string]: unknown } = {
		name,
		...queries,
		...Object.fromEntries(commands),
	}
	// The rules are read when they apply, so `.with` keeps the same value.
	model['with'] = (rules: unknown): object => {
		if (record.rules !== undefined) {
			throw new Error(`${name} takes its rules in one \`.with\`.`)
		}
		if (typeof rules !== 'object' || rules === null) {
			throw new Error(`${name}.with takes an object.`)
		}
		record.rules = rules
		return frozen
	}
	model['nullable'] = (): object =>
		nullable({ kind: 'model', value: frozen, name })
	const frozen = Object.freeze(model)
	modelDefinitions.set(frozen, record)
	return frozen
}
