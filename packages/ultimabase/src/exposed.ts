// What transports and tools read of the application's models and functions
// (D-16, D-107, D-109).
import type { Row, SchemaModel } from './adapter.ts'
import type { ExposedOutput } from './exposed-output.ts'
import type { Enum, StandardSchema } from './fields.ts'
import type { Client } from './function.ts'
import type { ModelShape } from './model.ts'
import type { QueryOptions } from './query.ts'

type Args = { readonly [key: string]: unknown }
/** A model's queries as a transport calls them, with its client's arguments. */
export interface ModelQueries {
	findUnique(args: Args, options: QueryOptions): Promise<Row | null>
	findMany(args: Args, options: QueryOptions): Promise<readonly Row[]>
	count(args: Args, options: QueryOptions): Promise<number>
	create(args: Args, options: QueryOptions): Promise<Row>
	update(args: Args, options: QueryOptions): Promise<Row>
	delete(args: Args, options: QueryOptions): Promise<Row>
}

/** A model as transports and tools read it (D-16, D-107). */
export interface ExposedModel<W = unknown> {
	/** As the adapter receives it (D-73). */
	readonly schema: SchemaModel
	/** The model's `description` and its fields' (D-150). */
	readonly description: string | undefined
	readonly descriptions: { readonly [field: string]: string }
	/** Each field's `deprecated`: why clients should stop using it (D-216). */
	readonly deprecations: { readonly [field: string]: string }
	/** Each field whose values are a `defineEnum` (D-150). */
	readonly enums: { readonly [field: string]: Enum }
	/** `id`, unique fields and unique indexes (D-52). */
	readonly uniques: readonly (readonly string[])[]
	/** Each field with a read rule, `private` when only Master reads it (D-44). */
	readonly readRules: { readonly [field: string]: 'private' | 'rule' }
	/** The fields `create` needs: neither optional nor with a default (D-53). */
	readonly required: readonly string[]
	/** Each `json` field's `validate`, when it is a Standard Schema (D-125). */
	readonly validators: { readonly [field: string]: StandardSchema }
	/** Each plugin field type's field, which a client reads as `toJSON` gives (D-122). */
	readonly fieldTypes: {
		readonly [field: string]: {
			readonly plugin: string
			/** The field type's own options the field took (D-152). */
			readonly options: { readonly [key: string]: unknown }
			readonly toJSON: (value: unknown) => unknown
			/** What `toJSON` gives, if the field type says (D-152). */
			readonly shape: StandardSchema | undefined
		}
	}
	/** Its virtual fields, in their order (D-151). */
	readonly virtuals: readonly ExposedVirtual[]
	/** The plugin's key of the model's `.with`, if it was given. */
	readonly with: W | undefined
	/** Whether the model's `use` lists the plugin's entry. */
	readonly used: boolean
	/** Whether it is the user model, which `viewer` filters (D-189). */
	readonly user: boolean
	readonly queries: ModelQueries
	/** `upsert`, which also says whether it created the row (D-142). */
	readonly upsert: (
		args: Args,
		options: QueryOptions,
	) => Promise<{ readonly row: Row; readonly created: boolean }>
	/** The `defineModel` value, which a plugin's function may return (D-113). */
	readonly model: ModelShape
}

/** A virtual field as transports read it (D-151). */
export interface ExposedVirtual {
	readonly name: string
	readonly description: string | undefined
	/** Why clients should stop reading it (D-216). */
	readonly deprecated: string | undefined
	/** A Standard Schema of an object: the field's arguments. */
	readonly input: StandardSchema | undefined
	readonly output: ExposedOutput
	/** In the row without `select`: a value without input. */
	readonly default: boolean
}

/** A function as transports read it (D-109). */
export interface ExposedFunction<W = unknown> {
	readonly name: string
	readonly description: string | undefined
	/** Why clients should stop calling it (D-216). */
	readonly deprecated: string | undefined
	/** The plugin that gives it, `undefined` for the application's (D-113). */
	readonly plugin: string | undefined
	/** A query, which a transport may serve over GET; a mutation otherwise. */
	readonly query: boolean
	/** Whether the function's `use` lists the plugin (D-154). */
	readonly used: boolean
	readonly input: StandardSchema | undefined
	/** `undefined` when it returns nothing. */
	readonly output: ExposedOutput | undefined
	/** The plugin's key of the function's `.with`, if it was given. */
	readonly with: W | undefined
	/** Checks access, validates the input, then runs it for `client` (D-75, D-113). */
	run(input: unknown, options: QueryOptions, client?: Client): Promise<unknown>
}
