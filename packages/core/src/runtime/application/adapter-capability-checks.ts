import { isPlainRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import { readWhereOperatorKey } from '../../query/filters/primitive.js'
import {
	getPluginFieldStructuralContains,
	type SchemaDefinition,
} from '../../schema/index.js'
import {
	databasePartialIndexCapabilityVersion,
	readDatabaseFilterOperatorFamily,
	readDeclaredFilterOperators,
} from '../database/adapter-capabilities.js'
import {
	databasePluginFieldStructuralContainsCapabilityVersion,
	databaseRelationCapabilityVersion,
	databaseRelationPredicateCapabilityVersion,
	type DatabaseAdapter,
} from '../database/contracts.js'

const hasCapability = (
	adapter: DatabaseAdapter,
	key: string,
	kind: string,
	version: number,
): boolean => {
	const capability: unknown =
		adapter.capabilities === undefined
			? undefined
			: Reflect.get(adapter.capabilities, key)
	return (
		isPlainRecord(capability) &&
		capability.kind === kind &&
		capability.version === version
	)
}

const missing = (
	adapterName: string,
	schema: string,
	field: string,
	requirement: Readonly<{ capability: string } | { operator: string }>,
	purpose: string,
): FrameworkError<'PLUGIN_ADAPTER_CAPABILITY_MISSING'> => {
	const needed =
		'capability' in requirement
			? `the ${requirement.capability} capability`
			: `the filter operator ${requirement.operator}`
	return new FrameworkError(
		'PLUGIN_ADAPTER_CAPABILITY_MISSING',
		`Database adapter ${adapterName} lacks ${needed} required by ${purpose} ${schema}.${field}.`,
		{
			internalDetails: {
				adapter: adapterName,
				field,
				kind: 'database-adapter-capability-missing',
				schema,
				...requirement,
			},
		},
	)
}

/** Checks the partial indexes of one schema against the adapter's declarations. */
const assertPartialIndexes = (
	schema: SchemaDefinition,
	adapter: DatabaseAdapter,
	adapterName: string,
): void => {
	for (const index of schema.indexes) {
		const [first] = index.fields
		if (index.where === undefined) continue
		if (
			!hasCapability(
				adapter,
				'partialIndexes',
				'partial-indexes',
				databasePartialIndexCapabilityVersion,
			)
		) {
			throw missing(
				adapterName,
				schema.className,
				first,
				{ capability: 'partial-indexes' },
				'the partial index on',
			)
		}
		for (const condition of index.where) {
			const family = readDatabaseFilterOperatorFamily(
				schema.persistedFields[condition.field],
			)
			if (
				family === undefined ||
				!readDeclaredFilterOperators(adapter.capabilities, family).includes(
					condition.kind,
				)
			) {
				throw missing(
					adapterName,
					schema.className,
					condition.field,
					{
						operator:
							condition.kind === 'null'
								? condition.isNull
									? 'isNull'
									: 'isNotNull'
								: readWhereOperatorKey(condition.kind),
					},
					'the partial index condition on',
				)
			}
		}
	}
}

/**
 * Fails application start when a statically known declaration needs something
 * the database adapter lacks (ADR-0301): partial indexes and their operators,
 * plugin-field containment filters (ACL `contains`) and relation fields.
 */
export const assertStaticAdapterCapabilities = (
	schemas: Iterable<SchemaDefinition>,
	adapter: DatabaseAdapter,
	adapterName: string,
): void => {
	for (const schema of schemas) {
		assertPartialIndexes(schema, adapter, adapterName)
		for (const [name, field] of Object.entries(schema.persistedFields)) {
			if (
				getPluginFieldStructuralContains(field) !== undefined &&
				!hasCapability(
					adapter,
					'pluginFieldStructuralContains',
					'plugin-field-structural-contains',
					databasePluginFieldStructuralContainsCapabilityVersion,
				)
			) {
				throw missing(
					adapterName,
					schema.className,
					name,
					{ capability: 'plugin-field-structural-contains' },
					'the containment filters of',
				)
			}
			if (field.kind !== 'relation') continue
			for (const [key, kind, version] of [
				['relations', 'relations', databaseRelationCapabilityVersion],
				[
					'relationPredicates',
					'relation-predicates',
					databaseRelationPredicateCapabilityVersion,
				],
			] as const) {
				if (!hasCapability(adapter, key, kind, version)) {
					throw missing(
						adapterName,
						schema.className,
						name,
						{ capability: kind },
						'the relation field',
					)
				}
			}
		}
	}
}
