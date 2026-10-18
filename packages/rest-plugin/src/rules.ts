import {
	defineSchemaOption,
	normalizeExposureRule,
	type ExposureCommandKey,
	type NativeExposureRules,
	type NormalizedExposureRule,
	type SchemaOptionDefinition,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'

/**
 * Exposure of one schema's methods over REST (ADR-0324, ADR-0347), with the
 * keys of `.with({ expose })`: `all`, a group, an operation or a method. The
 * most precise key present decides each method; a method the rule leaves out
 * follows `expose`, then `restPlugin({ default })`, then its built-in default.
 */
export interface RestMethodRules extends NativeExposureRules {
	/** Every route of the schema, and every request plugin command. */
	readonly all?: boolean
	/** The `find`, `count` and `exists` routes. */
	readonly read?: boolean
	/** Every native write route, and every request plugin command. */
	readonly write?: boolean
	/** The `findMany` and `findOne` routes. */
	readonly find?: boolean
	/** `POST /classes/{Schema}` and `POST /classes/{Schema}/bulk/create`. */
	readonly create?: boolean
	/** `PATCH /classes/{Schema}/{id}` and `POST /classes/{Schema}/bulk/update`. */
	readonly update?: boolean
	/** `POST /classes/{Schema}/upsert` and `POST /classes/{Schema}/bulk/upsert`. */
	readonly upsert?: boolean
	/** `DELETE /classes/{Schema}/{id}` and `POST /classes/{Schema}/bulk/delete`. */
	readonly delete?: boolean
	/** `GET /classes/{Schema}` and `POST /classes/{Schema}/query`. @default true */
	readonly findMany?: boolean
	/** `GET /classes/{Schema}/{id}` and `GET|POST /classes/{Schema}/first`. @default true */
	readonly findOne?: boolean
	/** `GET|POST /classes/{Schema}/count`. @default false */
	readonly count?: boolean
	/** `GET|POST /classes/{Schema}/exists`. @default true */
	readonly exists?: boolean
	/** `POST /classes/{Schema}`. @default true */
	readonly createOne?: boolean
	/** `PATCH /classes/{Schema}/{id}`. @default true */
	readonly updateOne?: boolean
	/** `DELETE /classes/{Schema}/{id}`. @default true */
	readonly deleteOne?: boolean
	/** `POST /classes/{Schema}/upsert`. @default false */
	readonly upsertOne?: boolean
	/** `POST /classes/{Schema}/bulk/create`, ordered and atomic. @default false */
	readonly createMany?: boolean
	/** `POST /classes/{Schema}/bulk/update`, ordered and atomic. @default false */
	readonly updateMany?: boolean
	/** `POST /classes/{Schema}/bulk/delete`, ordered and atomic. @default false */
	readonly deleteMany?: boolean
	/** `POST /classes/{Schema}/bulk/upsert`, ordered and atomic. @default false */
	readonly upsertMany?: boolean
}

/** One native schema method REST can expose. */
export type RestMethodName =
	| 'findMany'
	| 'findOne'
	| 'count'
	| 'exists'
	| 'createOne'
	| 'updateOne'
	| 'deleteOne'
	| 'upsertOne'
	| 'createMany'
	| 'updateMany'
	| 'deleteMany'
	| 'upsertMany'

/**
 * Names the plugin keys REST accepts for one schema: the `One` method and
 * the operation of each request command on one row (`archiveOne`, `archive`).
 */
export type RestCommandName<TSchema> = ExposureCommandKey<TSchema>

/**
 * REST exposure of one schema (ADR-0324, ADR-0347): `false` exposes nothing,
 * `true` every method and request command, an object each key by name. A
 * plugin command (`softDeleteOne`) is exposed only when a key opens it.
 *
 * @example `.with({ rest: { count: true, softDeleteOne: true } })`
 */
export type RestSchemaRule<TSchema = unknown> =
	boolean | (RestMethodRules & RestCommandRules<TSchema>)

/** The command keys of one schema's rule; none without a schema. */
type RestCommandRules<TSchema> = unknown extends TSchema
	? unknown
	: Partial<Readonly<Record<RestCommandName<TSchema>, boolean>>>

/** Entry of `.with({ … })` owned by REST, for one schema (ADR-0324). */
export interface RestRules<TSchema> {
	/**
	 * Exceptions to `.with({ expose })` for REST: each key wins over `expose`
	 * at any level, even when it is less precise. Methods it leaves out
	 * follow `expose`, then `restPlugin({ default })`, then the built-in
	 * defaults.
	 * @example `.with({ rest: { count: true, deleteOne: false } })`
	 */
	readonly rest?: RestSchemaRule<TSchema>
}

/** Contributes `rest` to `.with({ … })` through Core's rules slot (ADR-0324). */
export interface RestSchemaRules extends SchemaRulesHKT {
	readonly rules: RestRules<this['schema']>
}

/** Owns the `rest` rule; its static type comes from the `.with` rules slot. */
export const restSchemaOption: SchemaOptionDefinition<NormalizedExposureRule> =
	defineSchemaOption({
		normalize: (value, path): NormalizedExposureRule =>
			normalizeExposureRule(value, path),
		protocolVersion: 1,
	})
