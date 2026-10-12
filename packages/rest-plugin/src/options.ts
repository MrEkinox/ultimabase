import type {
	SchemaDefinition,
	UltimaBaseGeneratedSchemaSurfaces,
} from '@ultimabase/core'
import {
	defineSchemaOption,
	isPluginOperationDefinition,
	type PluginOperationDefinition,
	type PluginSchemaMutationDefinition,
	type PluginSchemaMutationDependencySelection,
	type PluginSchemaMutationEffect,
	type PluginSchemaMutationReturning,
	type PluginSourceSchemaMutations,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
	type SchemaRulesHKT,
	type SchemaRulesSource,
} from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { defaultRestReadLimits } from './reads.js'

/**
 * Exposure of one schema's methods over REST, keyed by the schema method
 * names (ADR-0324). An omitted method inherits `restPlugin({ default })`,
 * then its built-in default.
 */
export interface RestMethodRules {
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
export type RestMethodName = keyof RestMethodRules

type GeneratedMutations<TSchema> =
	TSchema extends Readonly<{
		className: infer TClassName extends keyof UltimaBaseGeneratedSchemaSurfaces
	}>
		? UltimaBaseGeneratedSchemaSurfaces[TClassName] extends Readonly<{
				readonly schemaMutations: infer TMutations
			}>
			? TMutations
			: Readonly<Record<never, never>>
		: Readonly<Record<never, never>>

type SchemaMutations<TSchema> = GeneratedMutations<TSchema> &
	PluginSourceSchemaMutations<SchemaRulesSource<TSchema>>

/** A command REST can expose: request authority, one row named by `id`. */
type ExposableCommand = PluginSchemaMutationDefinition<
	string,
	string,
	unknown,
	readonly string[],
	'request',
	PluginSchemaMutationEffect,
	PluginSchemaMutationReturning,
	PluginSchemaMutationDependencySelection,
	'one'
>

/** Names the plugin commands of one schema that REST can expose. */
export type RestCommandName<TSchema> = {
	readonly [
		TName in keyof SchemaMutations<TSchema>
	]: SchemaMutations<TSchema>[TName] extends ExposableCommand ? TName : never
}[keyof SchemaMutations<TSchema>] &
	string

/**
 * REST exposure of one schema (ADR-0324): `false` exposes nothing, `true`
 * every method and command, an object each method or command by name.
 * A plugin command (`softDeleteOne`) is exposed only when named.
 *
 * @example `rest: { count: true, softDeleteOne: true }`
 */
export type RestSchemaRule<TSchema = never> =
	| boolean
	| (RestMethodRules & {
			readonly [TCommand in RestCommandName<TSchema>]?: boolean
	  })

/** Entry of `.with({ ... })` owned by REST, for one schema (ADR-0324). */
export interface RestRules<TSchema> {
	/**
	 * Selects the REST routes of this schema by method name; omitted methods
	 * inherit `restPlugin({ default })`.
	 * @example `rest: { count: true, deleteOne: false }`
	 */
	readonly rest?: RestSchemaRule<TSchema>
}

/** Contributes `rest` to `.with({ ... })` through Core's rules slot (ADR-0324). */
export interface RestSchemaRules extends SchemaRulesHKT {
	readonly rules: RestRules<this['schema']>
}

/** Every native method key, in route order. */
export const restMethodNames: readonly RestMethodName[] = immutableArray([
	'findMany',
	'findOne',
	'count',
	'exists',
	'createOne',
	'updateOne',
	'deleteOne',
	'upsertOne',
	'createMany',
	'updateMany',
	'deleteMany',
	'upsertMany',
])
const methodKeys: ReadonlySet<string> = new Set(restMethodNames)
const commandKeyPattern = /^[a-z][A-Za-z0-9]*$/u

/** The normalized rule of one schema: a boolean, or a sparse per-key record. */
export type NormalizedRestRule = boolean | Readonly<Record<string, boolean>>

const normalizeRule = (
	value: unknown,
	path: string,
	commands: boolean,
): NormalizedRestRule => {
	if (typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const entries: [string, boolean][] = []
	for (const key of Reflect.ownKeys(value)) {
		const known =
			typeof key === 'string' &&
			(methodKeys.has(key) || (commands && commandKeyPattern.test(key)))
		if (!known) {
			throw new TypeError(
				`${path} contains unknown method: ${String(key)}; use ${restMethodNames.join(', ')}${commands ? ' or a plugin command name' : ''}`,
			)
		}
		const option: unknown = value[key]
		if (typeof option !== 'boolean') {
			throw new TypeError(`${path}.${key} must be a boolean`)
		}
		entries.push([key, option])
	}
	return immutableRecord(Object.fromEntries(entries))
}

/**
 * Owns the schema `rest` namespace. Its static type comes from the `.with`
 * rules slot (`never` keeps it out of the projection templates); Typegen
 * still types the old-form `define({ rest })` until that form is removed.
 */
export const restSchemaOption: SchemaOptionDefinition<
	NormalizedRestRule,
	SchemaOptionRuntimeRequirement,
	never
> = defineSchemaOption({
	normalize: (value, path): NormalizedRestRule =>
		normalizeRule(value, path, true),
	protocolVersion: 1,
	typegen: {
		module: '@ultimabase/rest-plugin',
		type: 'RestSchemaRule',
	},
})

const isNormalizedRule = (value: unknown): value is NormalizedRestRule =>
	typeof value === 'boolean' ||
	(isPlainRecord(value) &&
		Object.values(value).every((item) => typeof item === 'boolean'))

/** Reads the normalized rule without treating omission as a denial. */
export const readRestSchemaRule = (
	schema: SchemaDefinition,
): NormalizedRestRule | undefined => {
	if (!Object.hasOwn(schema.definition, 'rest')) return undefined
	const rule: unknown = Reflect.get(schema.definition, 'rest')
	return isNormalizedRule(rule) ? rule : undefined
}

/** Configures one REST instance (ADR-0324). */
export interface RestPluginOptions {
	/**
	 * Absolute prefix of every REST route; it carries no protocol version
	 * (the `X-UltimaBase-Rest-Version` response header does).
	 * @default "/api"
	 * @example `basePath: '/api/v1'` to version the application's own API
	 */
	readonly basePath?: string
	/**
	 * Maximum streamed JSON request size in bytes, replacing
	 * `httpPlugin({ bodyLimit })` for REST routes. @default the HTTP plugin's bodyLimit
	 */
	readonly bodyLimit?: number
	/**
	 * Exposure inherited by every schema method a `.with({ rest })` rule
	 * leaves out: `true`, `false`, or per method.
	 * @example `default: { createOne: false, updateOne: false, deleteOne: false }`
	 */
	readonly default?: boolean | RestMethodRules
	/**
	 * Public operations this instance does not expose; every other operation
	 * its owner declared public is exposed.
	 * @example `hide: [passwordAuthOperations.refresh]`
	 */
	readonly hide?: readonly PluginOperationDefinition[]
	/** Distinguishes two explicit REST configurations in one application. */
	readonly instanceId?: string
	/**
	 * Serves the OpenAPI 3.1 description of the exposed routes at
	 * `{basePath}/openapi.json`.
	 * @default false
	 */
	readonly openapi?: boolean
	/**
	 * Default and largest collection `take`, as GraphQL `first` (ADR-0309).
	 *
	 * @default { defaultTake: 100, maxTake: 1000 }
	 * @example `restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
	 */
	readonly pagination?: RestPaginationOptions
	/**
	 * Starts even when REST exposes writes and no protected policy (such as
	 * Access) is installed: every client may then write (ADR-0294).
	 * @default false
	 */
	readonly publicWrites?: boolean
}

/**
 * Configures the collection page window, with the same option and defaults
 * as `graphqlPlugin({ pagination })` (ADR-0309).
 *
 * @example `restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
 */
export interface RestPaginationOptions {
	/** `take` used when a collection read omits it. @default 100 */
	readonly defaultTake?: number
	/** Largest accepted `take`; a larger one is `REST_READ_INVALID_INPUT`. @default 1000 */
	readonly maxTake?: number
}

/** @internal Validates the page window shared by every REST collection read. */
const normalizeRestPagination = (
	value: unknown,
): Readonly<{ defaultTake: number; maxTake: number }> => {
	if (value === undefined) {
		return {
			defaultTake: defaultRestReadLimits.defaultTake,
			maxTake: defaultRestReadLimits.maxTake,
		}
	}
	if (!isPlainRecord(value)) {
		throw new TypeError('REST plugin pagination must be a plain object')
	}
	for (const key of Object.keys(value)) {
		if (key !== 'defaultTake' && key !== 'maxTake') {
			throw new TypeError(
				`REST plugin pagination has an unknown option: ${key}`,
			)
		}
	}
	const defaultTake = normalizePositiveSafeInteger(
		value.defaultTake,
		'pagination.defaultTake',
		defaultRestReadLimits.defaultTake,
	)
	const maxTake = normalizePositiveSafeInteger(
		value.maxTake,
		'pagination.maxTake',
		defaultRestReadLimits.maxTake,
	)
	if (defaultTake > maxTake) {
		throw new TypeError(
			'REST plugin pagination.defaultTake must not exceed pagination.maxTake',
		)
	}
	return { defaultTake, maxTake }
}

/** @internal Validates the public operation tokens one REST instance hides. */
const normalizeRestHide = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('REST plugin hide must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`REST plugin hide[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`REST plugin hide repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}

const normalizeBasePath = (value: unknown): string => {
	if (value === undefined) return '/api'
	if (typeof value !== 'string' || !value.startsWith('/')) {
		throw new TypeError('REST plugin basePath must be an absolute path')
	}
	if (value.includes('?') || value.includes('#')) {
		throw new TypeError(
			'REST plugin basePath cannot contain a query or fragment',
		)
	}
	if (value.length > 1 && value.endsWith('/')) {
		throw new TypeError('REST plugin basePath cannot have a trailing slash')
	}
	const segments = value === '/' ? [] : value.slice(1).split('/')
	if (segments.some((segment) => segment.length === 0)) {
		throw new TypeError('REST plugin basePath must not contain empty segments')
	}
	for (const segment of segments) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError('REST plugin basePath contains invalid encoding')
		}
		if (decoded === '.' || decoded === '..') {
			throw new TypeError('REST plugin basePath cannot contain dot segments')
		}
	}
	return value
}

const normalizePositiveSafeInteger = (
	value: unknown,
	name: string,
	fallback: number,
): number => {
	if (value === undefined) return fallback
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`REST plugin ${name} must be a positive safe integer`)
	}
	return value
}

const normalizeBoolean = (value: unknown, name: string): boolean => {
	if (value === undefined) return false
	if (typeof value !== 'boolean') {
		throw new TypeError(`REST plugin ${name} must be a boolean`)
	}
	return value
}

/** @internal The validated configuration one `restPlugin()` call closes over. */
export interface NormalizedRestPluginOptions {
	/** The mount path; `/` mounts REST at the root. */
	readonly basePath: string
	/** `undefined` inherits the HTTP plugin's limit (ADR-0323). */
	readonly bodyLimit: number | undefined
	readonly defaultRule: NormalizedRestRule | undefined
	readonly hide: readonly PluginOperationDefinition[]
	readonly instanceId: string | undefined
	readonly openapi: boolean
	readonly pagination: Readonly<{ defaultTake: number; maxTake: number }>
	readonly publicWrites: boolean
}

/** @internal Rejects unknown keys and normalizes every plugin factory option. */
export const parseRestPluginOptions: (
	options: RestPluginOptions,
) => NormalizedRestPluginOptions = definePluginOptionsParser({
	name: 'REST plugin options',
	keys: [
		'basePath',
		'bodyLimit',
		'default',
		'hide',
		'instanceId',
		'openapi',
		'pagination',
		'publicWrites',
	] as const,
	normalize: ({
		basePath,
		bodyLimit,
		default: defaultRule,
		hide,
		instanceId,
		openapi,
		pagination,
		publicWrites,
	}) => {
		if (
			instanceId !== undefined &&
			(typeof instanceId !== 'string' || instanceId.length === 0)
		) {
			throw new TypeError('REST plugin instanceId must be a non-empty string')
		}
		return {
			basePath: normalizeBasePath(basePath),
			bodyLimit:
				bodyLimit === undefined
					? undefined
					: normalizePositiveSafeInteger(
							bodyLimit,
							'bodyLimit',
							defaultRestReadLimits.bodyBytes,
						),
			defaultRule:
				defaultRule === undefined
					? undefined
					: normalizeRule(defaultRule, 'REST plugin default', false),
			hide: normalizeRestHide(hide),
			instanceId,
			openapi: normalizeBoolean(openapi, 'openapi'),
			pagination: normalizeRestPagination(pagination),
			publicWrites: normalizeBoolean(publicWrites, 'publicWrites'),
		}
	},
})
