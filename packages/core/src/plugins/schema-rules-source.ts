import type {
	IsSchemaRef,
	RegisteredSchema,
} from '../schema/schema/registered-schemas.js'

/**
 * The schema whose statics carry plugin commands and permissions, for one
 * schema given to a rules slot: a registered `SchemaRef<"Todo">` (ADR-0297)
 * names its schema without its statics, so it reads the registered schema.
 * A schema constant, as `schemaHooks(Post, …)` receives it, is returned
 * as is. Read a `SchemaRef` only from lazy positions such as `.with` rules:
 * it reads the application registry.
 *
 * @example `SchemaMutationAccessMap<SchemaRulesSource<this['schema']>>`
 */
export type SchemaRulesSource<TSchema> =
	IsSchemaRef<TSchema> extends true
		? TSchema extends { readonly className: infer TClassName extends string }
			? [RegisteredSchema<TClassName>] extends [never]
				? TSchema
				: RegisteredSchema<TClassName>
			: TSchema
		: // A schema constant carries its own statics: reading the registry here
			// would type a contributing plugin through the application it joins.
			TSchema
