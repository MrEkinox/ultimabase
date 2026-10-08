import {
	defineSchemaOption,
	isPluginOperationDefinition,
	type PluginOperationDefinition,
	type SchemaDefinition,
	type SchemaOptionDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Selects itemized bulk mutation fields for one generated GraphQL type. */
export interface GraphqlBulkOperations {
	/** Generates ordered itemized bulk create mutations. */
	readonly create?: boolean
	/** Generates ordered itemized bulk update mutations. */
	readonly update?: boolean
	/** Generates ordered itemized bulk delete mutations. */
	readonly delete?: boolean
	/** Generates ordered itemized bulk upsert mutations. */
	readonly upsert?: boolean
}

/** Selects generated GraphQL operations for one application-owned schema. */
export interface GraphqlSchemaOperations {
	/** Generates the exact-ID query field. */
	readonly get?: boolean
	/** Generates the first-match query field. */
	readonly findOne?: boolean
	/** Generates the cursor connection query field. */
	readonly findMany?: boolean
	/** Generates the filtered count query field. */
	readonly count?: boolean
	/** Generates the filtered existence query field. */
	readonly exists?: boolean
	/** Generates the singular create mutation field. */
	readonly create?: boolean
	/** Generates the singular update mutation field. */
	readonly update?: boolean
	/** Generates the singular delete mutation field. */
	readonly delete?: boolean
	/** Generates the singular upsert mutation field. */
	readonly upsert?: boolean
	/** Generates explicitly bound plugin-owned schema mutation fields. */
	readonly mutations?: boolean
	/** Selects all or individual itemized bulk mutation fields. */
	readonly bulk?: boolean | GraphqlBulkOperations
}

/** Configures the generated GraphQL representation of one schema. */
export interface GraphqlSchemaExposure {
	/** Overrides the exact GraphQL object name without changing Core identity. */
	readonly typeName?: string
	/** Supplies sparse operation overrides inherited ahead of plugin defaults. */
	readonly operations?: boolean | GraphqlSchemaOperations
}

export type GraphqlSchemaExposureOption = boolean | GraphqlSchemaExposure

const operationKeys: ReadonlySet<string> = new Set([
	'bulk',
	'count',
	'create',
	'delete',
	'exists',
	'findMany',
	'findOne',
	'get',
	'mutations',
	'update',
	'upsert',
])
const bulkKeys: ReadonlySet<string> = new Set([
	'create',
	'delete',
	'update',
	'upsert',
])
const exposureKeys = new Set(['operations', 'typeName'])

/** Returns one own key when it is a declared string key, otherwise rejects it. */
const readGraphqlKnownKey = (
	key: string | symbol,
	keys: ReadonlySet<string>,
	path: string,
	label = 'unknown option',
): string => {
	if (typeof key !== 'string' || !keys.has(key)) {
		throw new TypeError(`${path} contains ${label}: ${String(key)}`)
	}
	return key
}

/** Rejects symbol and undeclared keys, naming the first offending key. */
export const assertGraphqlKnownKeys = (
	value: object,
	keys: ReadonlySet<string>,
	path: string,
	label?: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		readGraphqlKnownKey(key, keys, path, label)
	}
}

const readBoolean = (value: unknown, path: string): boolean => {
	if (typeof value !== 'boolean') {
		throw new TypeError(`${path} must be a boolean`)
	}
	return value
}

// Snapshots one closed option object, validating each key before its value.
const snapshotFlags = <TValue>(
	value: unknown,
	path: string,
	keys: ReadonlySet<string>,
	read: (option: unknown, key: string) => TValue,
): Readonly<Record<string, TValue>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const entries: [string, TValue][] = []
	for (const ownKey of Reflect.ownKeys(value)) {
		const key = readGraphqlKnownKey(ownKey, keys, path)
		entries.push([key, read(value[key], key)])
	}
	return immutableRecord(Object.fromEntries(entries))
}

/** Snapshots sparse generated-operation selection without filling inheritance. */
export const normalizeGraphqlSchemaOperations = (
	value: unknown,
	path: string,
): boolean | GraphqlSchemaOperations =>
	typeof value === 'boolean'
		? value
		: snapshotFlags(value, path, operationKeys, (option, key) =>
				key === 'bulk' && typeof option !== 'boolean'
					? snapshotFlags(option, `${path}.bulk`, bulkKeys, (flag, name) =>
							readBoolean(flag, `${path}.bulk.${name}`),
						)
					: readBoolean(option, `${path}.${key}`),
			)

/** Snapshots one direct schema GraphQL option. */
export const normalizeGraphqlSchemaExposure = (
	value: unknown,
	path: string,
): GraphqlSchemaExposureOption => {
	if (typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	assertGraphqlKnownKeys(value, exposureKeys, path)
	const typeName = value.typeName
	if (
		typeName !== undefined &&
		(typeof typeName !== 'string' || typeName === '')
	) {
		throw new TypeError(`${path}.typeName must be a non-empty string`)
	}
	const operations = value.operations
	return immutableRecord({
		...(typeName === undefined ? {} : { typeName }),
		...(operations === undefined
			? {}
			: {
					operations: normalizeGraphqlSchemaOperations(
						operations,
						`${path}.operations`,
					),
				}),
	})
}

/** Owns the direct application schema `graphql` exposure option. */
export const graphqlSchemaOption: SchemaOptionDefinition<GraphqlSchemaExposureOption> =
	defineSchemaOption({
		normalize: normalizeGraphqlSchemaExposure,
		protocolVersion: 1,
		// The installed plugin projects this option from source, not Typegen.
		typegen: false,
	})

/** Reads the normalized direct option without treating omission as denial. */
export const readGraphqlSchemaExposure = (
	schema: SchemaDefinition,
): GraphqlSchemaExposureOption | undefined =>
	Object.hasOwn(schema.definition, 'graphql')
		? (Reflect.get(schema.definition, 'graphql') as
				GraphqlSchemaExposureOption | undefined)
		: undefined

/** Validates the exact application operation tokens selected for GraphQL. */
export const normalizeGraphqlPluginOperations = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL plugin operations must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`GraphQL plugin operations[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`GraphQL plugin operations repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}
