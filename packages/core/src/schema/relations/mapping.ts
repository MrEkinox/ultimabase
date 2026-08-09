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
): string | undefined => {
	if (!('mappedBy' in field.options)) return undefined

	return typeof field.options.mappedBy === 'string'
		? field.options.mappedBy
		: undefined
}

const relationLocation = (relation: PendingSchemaRelation): string =>
	`${relation.source.className}.${relation.fieldPath.join('.')}`

const mappedRelationKey = (
	schema: SchemaDefinition,
	fieldName: string,
): string => `${schema.className}:${fieldName}`

/** Validates complete ownership topology after all lazy targets resolve. */
export const compileSchemaRelations = (
	pendingRelations: readonly PendingSchemaRelation[],
	targets: readonly ResolvedSchemaTarget[],
	readFields: (schema: SchemaDefinition) => SchemaFields = (schema) =>
		schema.fields,
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
		const location = relationLocation(relation)

		if (relation.fieldPath.length !== 1) {
			throw new SchemaRelationMappingError(
				'incompatible-mapping',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Relation field ${location} must be declared at the schema root`,
				relation.mappedBy,
			)
		}

		if (relation.mappedBy === undefined) {
			const previousLocation = owningFieldLocations.get(relation.field)

			if (previousLocation !== undefined) {
				throw new SchemaRelationMappingError(
					'multiply-owned-mapping',
					relation.source,
					relation.fieldPath,
					relation.target,
					`Owning relation field ${location} reuses the definition from ${previousLocation}`,
				)
			}

			owningFieldLocations.set(relation.field, location)
			relations.push(
				immutableRecord({
					fieldPath: relation.fieldPath,
					ownership: 'owning',
					source: relation.source,
					target: relation.target,
				}),
			)
			continue
		}

		const mappedField = readFields(relation.target)[relation.mappedBy]

		if (mappedField === undefined) {
			throw new SchemaRelationMappingError(
				'missing-mapped-field',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Inverse relation ${location} maps missing field ${relation.target.className}.${relation.mappedBy}`,
				relation.mappedBy,
			)
		}

		if (mappedField.kind !== 'pointer' && mappedField.kind !== 'relation') {
			throw new SchemaRelationMappingError(
				'incompatible-mapping',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Inverse relation ${location} must map a pointer or owning relation field`,
				relation.mappedBy,
			)
		}

		const mappedLocation = mappedRelationKey(relation.target, relation.mappedBy)
		const mappedTarget = targetByLocation.get(mappedLocation)

		if (mappedTarget !== relation.source) {
			throw new SchemaRelationMappingError(
				'incompatible-mapping',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Inverse relation ${location} must map a field targeting ${relation.source.className}`,
				relation.mappedBy,
			)
		}

		if (
			relation.source === relation.target &&
			relation.fieldPath[0] === relation.mappedBy
		) {
			throw new SchemaRelationMappingError(
				'self-conflicting-mapping',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Inverse relation ${location} cannot map itself`,
				relation.mappedBy,
			)
		}

		if (
			mappedField.kind === 'relation' &&
			readRelationMappedBy(mappedField) !== undefined
		) {
			throw new SchemaRelationMappingError(
				'self-conflicting-mapping',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Inverse relation ${location} cannot map another inverse relation`,
				relation.mappedBy,
			)
		}

		const previousInverse = inverseByOwner.get(mappedLocation)

		if (previousInverse !== undefined) {
			throw new SchemaRelationMappingError(
				'ambiguous-mapping',
				relation.source,
				relation.fieldPath,
				relation.target,
				`Inverse relation ${location} conflicts with ${previousInverse} for ${relation.target.className}.${relation.mappedBy}`,
				relation.mappedBy,
			)
		}

		inverseByOwner.set(mappedLocation, location)
		relations.push(
			immutableRecord({
				fieldPath: relation.fieldPath,
				mappedBy: immutableRecord({
					fieldPath: immutableArray([relation.mappedBy]),
					kind: mappedField.kind,
					schema: relation.target,
				}),
				ownership: 'inverse',
				source: relation.source,
				target: relation.target,
			}),
		)
	}

	return immutableArray(relations)
}
