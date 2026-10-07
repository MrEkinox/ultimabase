import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import type { SchemaDefinition, SchemaFields } from '../schema/definition.js'
import type { ResolvedSchemaTarget } from '../schema/targets.js'

/** Identifies how one relation reaches its adapter-owned edge storage. */
export type SchemaRelationOwnership = 'inverse' | 'owning'

/** Points from an inverse relation to the exact target field that owns storage. */
export interface ResolvedSchemaRelationMapping {
	readonly schema: SchemaDefinition
	readonly fieldPath: readonly string[]
	readonly kind: 'pointer' | 'relation'
}

/** Describes one validated to-many relation independently from physical storage. */
export interface ResolvedSchemaRelation {
	readonly source: SchemaDefinition
	readonly fieldPath: readonly string[]
	readonly target: SchemaDefinition
	readonly ownership: SchemaRelationOwnership
	readonly mappedBy?: ResolvedSchemaRelationMapping
}

/** Explains why one inverse or owning relation mapping is invalid. */
export type SchemaRelationMappingReason =
	| 'ambiguous-mapping'
	| 'incompatible-mapping'
	| 'missing-mapped-field'
	| 'multiply-owned-mapping'
	| 'self-conflicting-mapping'

/** Reports relation topology failures before infrastructure starts. */
export class SchemaRelationMappingError extends Error {
	readonly code = 'SCHEMA_RELATION_MAPPING_FAILED' as const
	readonly reason: SchemaRelationMappingReason
	readonly sourceClassName: string
	readonly fieldPath: readonly string[]
	readonly targetClassName: string
	readonly mappedBy: string | undefined

	constructor(
		reason: SchemaRelationMappingReason,
		source: SchemaDefinition,
		fieldPath: readonly string[],
		target: SchemaDefinition,
		message: string,
		mappedBy?: string,
	) {
		super(message)

		this.name = 'SchemaRelationMappingError'
		this.reason = reason
		this.sourceClassName = source.className
		this.fieldPath = immutableArray(fieldPath)
		this.targetClassName = target.className
		this.mappedBy = mappedBy
		Object.freeze(this)
	}
}

/** Retains one resolved relation until every inverse can be checked together. */
export interface PendingSchemaRelation {
	readonly field: GenericField
	readonly fieldPath: readonly string[]
	readonly mappedBy: string | undefined
	readonly source: SchemaDefinition
	readonly target: SchemaDefinition
}

/** Reads normalized inverse metadata without widening ordinary target entries. */
export const readRelationMappedBy = (
	field: GenericField,
): string | undefined =>
	'mappedBy' in field.options && typeof field.options.mappedBy === 'string'
		? field.options.mappedBy
		: undefined

const mappedRelationKey = (
	schema: SchemaDefinition,
	fieldName: string,
): string => `${schema.className}:${fieldName}`

/** Validates complete ownership topology after all lazy targets resolve. */
export const compileSchemaRelations = (
	pendingRelations: readonly PendingSchemaRelation[],
	targets: readonly ResolvedSchemaTarget[],
	readFields: (schema: SchemaDefinition) => SchemaFields = (schema) =>
		schema.persistedFields,
): readonly ResolvedSchemaRelation[] => {
	const targetByLocation = new Map<string, SchemaDefinition>()
	const owningFieldLocations = new Map<GenericField, string>()
	const inverseByOwner = new Map<string, string>()
	const relations: ResolvedSchemaRelation[] = []

	for (const target of targets) {
		targetByLocation.set(
			mappedRelationKey(target.source, target.fieldPath.join('.')),
			target.target,
		)
	}

	for (const relation of pendingRelations) {
		const { fieldPath, mappedBy, source, target } = relation
		const location = `${source.className}.${fieldPath.join('.')}`
		const mappingError = (
			reason: SchemaRelationMappingReason,
			message: string,
		) =>
			new SchemaRelationMappingError(
				reason,
				source,
				fieldPath,
				target,
				message,
				mappedBy,
			)

		if (fieldPath.length !== 1) {
			throw mappingError(
				'incompatible-mapping',
				`Relation field ${location} must be declared at the schema root`,
			)
		}

		if (mappedBy === undefined) {
			const previousLocation = owningFieldLocations.get(relation.field)
			if (previousLocation !== undefined) {
				throw mappingError(
					'multiply-owned-mapping',
					`Owning relation field ${location} reuses the definition from ${previousLocation}`,
				)
			}

			owningFieldLocations.set(relation.field, location)
			relations.push(
				immutableRecord({ fieldPath, ownership: 'owning', source, target }),
			)
			continue
		}

		const mappedField = readFields(target)[mappedBy]
		const mappedLocation = mappedRelationKey(target, mappedBy)
		const previousInverse = inverseByOwner.get(mappedLocation)

		// Checks run from structural to topological so each failure names its root cause.
		if (mappedField === undefined) {
			throw mappingError(
				'missing-mapped-field',
				`Inverse relation ${location} maps missing field ${target.className}.${mappedBy}`,
			)
		}
		if (mappedField.kind !== 'pointer' && mappedField.kind !== 'relation') {
			throw mappingError(
				'incompatible-mapping',
				`Inverse relation ${location} must map a pointer or owning relation field`,
			)
		}
		if (targetByLocation.get(mappedLocation) !== source) {
			throw mappingError(
				'incompatible-mapping',
				`Inverse relation ${location} must map a field targeting ${source.className}`,
			)
		}
		if (source === target && fieldPath[0] === mappedBy) {
			throw mappingError(
				'self-conflicting-mapping',
				`Inverse relation ${location} cannot map itself`,
			)
		}
		if (
			mappedField.kind === 'relation' &&
			readRelationMappedBy(mappedField) !== undefined
		) {
			throw mappingError(
				'self-conflicting-mapping',
				`Inverse relation ${location} cannot map another inverse relation`,
			)
		}
		if (previousInverse !== undefined) {
			throw mappingError(
				'ambiguous-mapping',
				`Inverse relation ${location} conflicts with ${previousInverse} for ${target.className}.${mappedBy}`,
			)
		}

		inverseByOwner.set(mappedLocation, location)
		relations.push(
			immutableRecord({
				fieldPath,
				mappedBy: immutableRecord({
					fieldPath: immutableArray([mappedBy]),
					kind: mappedField.kind,
					schema: target,
				}),
				ownership: 'inverse',
				source,
				target,
			}),
		)
	}

	return immutableArray(relations)
}
