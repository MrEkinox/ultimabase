import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { JsonValue } from '../fields/builtins/json.js'
import type { GenericField } from '../fields/base/contract.js'
import type { GenericVirtualField } from './virtual-field.js'
import type { SchemaIndexDefinition } from './indexes.js'
import type { SchemaConstraintDefinition } from './constraints.js'

/** Identifies developer declarations owned by one application. */
export interface ApplicationSchemaContributionOwner {
	readonly kind: 'application'
}

/** Identifies protected framework contributions. */
export interface CoreSchemaContributionOwner {
	readonly kind: 'core'
}

/** Identifies one exact configured plugin and package version. */
export interface PluginSchemaContributionOwner {
	readonly instanceId?: string
	readonly kind: 'plugin'
	readonly pluginId: string
	readonly version: string
}

/** Names every owner represented by the logical schema snapshot. */
export type SchemaContributionOwner =
	| ApplicationSchemaContributionOwner
	| CoreSchemaContributionOwner
	| PluginSchemaContributionOwner

/** References an existing owner without making package versions part of identity. */
export type SchemaContributionOwnerReference =
	| ApplicationSchemaContributionOwner
	| CoreSchemaContributionOwner
	| Readonly<{
			readonly instanceId?: string
			readonly kind: 'plugin'
			readonly pluginId: string
	  }>

/** Records the exact source and portable facts for one logical contribution. */
export interface SchemaContributionProvenance {
	readonly contributionId: string
	readonly normalizedStaticOptions: Readonly<Record<string, JsonValue>>
	readonly owner: SchemaContributionOwner
	readonly protocolVersion: number
}

/** Associates one normalized index with its exact contribution source. */
export interface SchemaIndexProvenance {
	readonly definition: SchemaIndexDefinition
	readonly provenance: SchemaContributionProvenance
}

/** Associates one portable constraint with its exact contribution source. */
export interface SchemaConstraintProvenance {
	readonly definition: SchemaConstraintDefinition
	readonly provenance: SchemaContributionProvenance
}

/** Separates the value contributor from the plugin that defines its semantics. */
export interface SchemaOptionProvenance {
	readonly definition: SchemaContributionProvenance
	readonly value: SchemaContributionProvenance
}

/** Explains one applied callback-free patch in deterministic order. */
export interface AppliedSchemaPatchProvenance {
	readonly kind: string
	readonly provenance: SchemaContributionProvenance
	readonly targetClassName: string
}

/** Explains every component of one final logical schema definition. */
export interface SchemaCompilationProvenance {
	readonly constraints: readonly SchemaConstraintProvenance[]
	readonly fields: Readonly<Record<string, SchemaContributionProvenance>>
	readonly fieldOptions: Readonly<
		Record<string, Readonly<Record<string, SchemaOptionProvenance>>>
	>
	readonly indexes: readonly SchemaIndexProvenance[]
	readonly options: Readonly<Record<string, SchemaOptionProvenance>>
	readonly patches: readonly AppliedSchemaPatchProvenance[]
	readonly schema: SchemaContributionProvenance
}

export const applicationSchemaContributionOwner: ApplicationSchemaContributionOwner =
	immutableRecord({ kind: 'application' })
export const coreSchemaContributionOwner: CoreSchemaContributionOwner =
	immutableRecord({ kind: 'core' })
export const emptySchemaContributionStaticOptions: Readonly<
	Record<string, JsonValue>
> = immutableRecord({})

/** Creates one immutable provenance record through the shared protocol version. */
export const createSchemaContributionProvenance = (
	owner: SchemaContributionOwner,
	contributionId: string,
	normalizedStaticOptions: Readonly<
		Record<string, JsonValue>
	> = emptySchemaContributionStaticOptions,
	protocolVersion = 1,
): SchemaContributionProvenance =>
	immutableRecord({
		contributionId,
		normalizedStaticOptions,
		owner,
		protocolVersion,
	})

const mapRecord = <TValue>(
	keys: readonly string[],
	createValue: (key: string) => TValue,
): Readonly<Record<string, TValue>> =>
	immutableRecord(
		Object.fromEntries(keys.map((key) => [key, createValue(key)])),
	)

const optionProvenance = (
	definitionOwner: SchemaContributionOwner,
	definitionId: string,
	valueOwner: SchemaContributionOwner,
	valueId: string,
): SchemaOptionProvenance =>
	immutableRecord({
		definition: createSchemaContributionProvenance(
			definitionOwner,
			definitionId,
		),
		value: createSchemaContributionProvenance(valueOwner, valueId),
	})

/** Creates the application/Core baseline that plugins may immutably replace. */
export const createInitialSchemaProvenance = (
	className: string,
	developerFieldNames: readonly string[],
	declaredFields: Readonly<Record<string, GenericField | GenericVirtualField>>,
	indexes: readonly SchemaIndexDefinition[],
	optionNames: readonly string[],
): SchemaCompilationProvenance => {
	const application = applicationSchemaContributionOwner
	const developerFields = new Set(developerFieldNames)
	const ownerOf = (fieldName: string): SchemaContributionOwner =>
		developerFields.has(fieldName) ? application : coreSchemaContributionOwner

	return immutableRecord({
		constraints: immutableArray([]),
		fields: mapRecord(Object.keys(declaredFields), (name) =>
			createSchemaContributionProvenance(
				ownerOf(name),
				`field:${className}.${name}`,
			),
		),
		fieldOptions: immutableRecord(
			Object.fromEntries(
				Object.entries(declaredFields).map(([fieldName, field]) => [
					fieldName,
					mapRecord(Object.keys(field.options), (optionName) =>
						optionProvenance(
							coreSchemaContributionOwner,
							`field-option-definition:${field.kind}.${optionName}`,
							ownerOf(fieldName),
							`field-option:${className}.${fieldName}.${optionName}`,
						),
					),
				]),
			),
		),
		indexes: immutableArray(
			indexes.map((definition, index) =>
				immutableRecord({
					definition,
					provenance: createSchemaContributionProvenance(
						application,
						`index:${className}:${String(index)}`,
					),
				}),
			),
		),
		options: mapRecord(optionNames, (name) =>
			optionProvenance(
				application,
				`schema-option-definition:${name}`,
				application,
				`schema-option:${className}.${name}`,
			),
		),
		patches: immutableArray([]),
		schema: createSchemaContributionProvenance(
			application,
			`schema:${className}`,
		),
	})
}
