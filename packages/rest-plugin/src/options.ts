import {
	defineSchemaOption,
	type SchemaDefinition,
	type SchemaOptionDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Selects the itemized bulk REST routes generated for one schema. */
export interface RestBulkRoutes {
	/** Generates `POST /bulk/create`. */
	readonly create?: boolean
	/** Generates `POST /bulk/update`. */
	readonly update?: boolean
	/** Generates `POST /bulk/delete`. */
	readonly delete?: boolean
	/** Generates `POST /bulk/upsert`. */
	readonly upsert?: boolean
}

/** Selects the REST v1 routes generated for one application-owned schema. */
export interface RestSchemaRoutes {
	/** Generates the simple GET and complex POST collection queries. */
	readonly find?: boolean
	/** Generates the UUID-v7 item read route. */
	readonly get?: boolean
	/** Generates the GET and POST first-item routes. */
	readonly first?: boolean
	/** Generates the GET and POST count routes. */
	readonly count?: boolean
	/** Generates the GET and POST existence routes. */
	readonly exists?: boolean
	/** Generates the collection create route. */
	readonly create?: boolean
	/** Generates the UUID-v7 item update route. */
	readonly update?: boolean
	/** Generates the UUID-v7 item delete route. */
	readonly delete?: boolean
	/** Generates the explicit unique-predicate upsert route. */
	readonly upsert?: boolean
	/** Selects homogeneous, ordered, atomic itemized bulk routes. */
	readonly bulk?: boolean | RestBulkRoutes
}

export type RestSchemaRoutesOption = boolean | RestSchemaRoutes

const schemaRouteKeys = new Set([
	'bulk',
	'count',
	'create',
	'delete',
	'exists',
	'find',
	'first',
	'get',
	'update',
	'upsert',
])
const bulkRouteKeys = new Set(['create', 'delete', 'update', 'upsert'])

const assertBoolean = (value: unknown, path: string): boolean => {
	if (typeof value !== 'boolean') {
		throw new TypeError(`${path} must be a boolean`)
	}
	return value
}

const normalizeBulkRoutes = (value: unknown, path: string): RestBulkRoutes => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const normalized: Record<string, boolean> = {}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !bulkRouteKeys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
		normalized[key] = assertBoolean(value[key], `${path}.${key}`)
	}
	return immutableRecord(normalized)
}

/** Normalizes a sparse route selection while preserving inheritance by omission. */
export const normalizeRestSchemaRoutes = (
	value: unknown,
	path: string,
): RestSchemaRoutesOption => {
	if (typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}

	const normalized: Record<string, boolean | RestBulkRoutes> = {}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !schemaRouteKeys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
		const option = value[key]
		normalized[key] =
			key === 'bulk' && typeof option !== 'boolean'
				? normalizeBulkRoutes(option, `${path}.bulk`)
				: assertBoolean(option, `${path}.${key}`)
	}
	return immutableRecord(normalized)
}

/** Owns the direct application schema `rest` route-selection option. */
export const restSchemaOption: SchemaOptionDefinition<RestSchemaRoutesOption> =
	defineSchemaOption({
		normalize: normalizeRestSchemaRoutes,
		protocolVersion: 1,
		typegen: {
			module: '@ultimabase/rest-plugin',
			type: 'RestSchemaRoutesOption',
		},
	})

/** Reads the normalized direct option without treating omission as a denial. */
export const readRestSchemaRoutes = (
	schema: SchemaDefinition,
): RestSchemaRoutesOption | undefined =>
	Object.hasOwn(schema.definition, 'rest')
		? (Reflect.get(schema.definition, 'rest') as
				RestSchemaRoutesOption | undefined)
		: undefined
