import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { JsonValue } from '../fields/builtins/json.js'
import type { GenericField } from '../fields/base/contract.js'
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

/** Associates one ordered extension with its exact contribution source. */
export interface SchemaExtensionProvenance {
	readonly name: string
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
	readonly extensions: readonly SchemaExtensionProvenance[]
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

/** Creates the application/Core baseline that plugins may immutably replace. */
export const createInitialSchemaProvenance = (
	className: string,
	developerFieldNames: readonly string[],
	declaredFields: Readonly<Record<string, GenericField>>,
	indexes: readonly SchemaIndexDefinition[],
	extensionNames: readonly string[],
	optionNames: readonly string[],
): SchemaCompilationProvenance => {
	const developerFields = new Set(developerFieldNames)
	const schema = createSchemaContributionProvenance(
		applicationSchemaContributionOwner,
		`schema:${className}`,
	)
	const fields = immutableRecord(
		Object.fromEntries(
			Object.keys(declaredFields).map((name) => [
				name,
				createSchemaContributionProvenance(
					developerFields.has(name)
						? applicationSchemaContributionOwner
						: coreSchemaContributionOwner,
					`field:${className}.${name}`,
				),
			]),
		),
	)

	return immutableRecord({
		constraints: immutableArray([]),
		extensions: immutableArray(
			extensionNames.map((name, index) =>
				immutableRecord({
					name,
					provenance: createSchemaContributionProvenance(
						applicationSchemaContributionOwner,
						`extension:${className}:${String(index)}:${name}`,
					),
				}),
			),
		),
		fields,
		fieldOptions: immutableRecord(
			Object.fromEntries(
				Object.entries(declaredFields).map(([fieldName, field]) => {
					const valueOwner = developerFields.has(fieldName)
						? applicationSchemaContributionOwner
						: coreSchemaContributionOwner
					return [
						fieldName,
						immutableRecord(
							Object.fromEntries(
								Object.keys(field.options).map((optionName) => [
									optionName,
									immutableRecord({
										definition: createSchemaContributionProvenance(
											coreSchemaContributionOwner,
											`field-option-definition:${field.kind}.${optionName}`,
										),
										value: createSchemaContributionProvenance(
											valueOwner,
											`field-option:${className}.${fieldName}.${optionName}`,
										),
									}),
								]),
							),
						),
					]
				}),
			),
		),
		indexes: immutableArray(
			indexes.map((definition, index) =>
				immutableRecord({
					definition,
					provenance: createSchemaContributionProvenance(
						applicationSchemaContributionOwner,
						`index:${className}:${String(index)}`,
					),
				}),
			),
		),
		options: immutableRecord(
			Object.fromEntries(
				optionNames.map((name) => [
					name,
					immutableRecord({
						definition: createSchemaContributionProvenance(
							applicationSchemaContributionOwner,
							`schema-option-definition:${name}`,
						),
						value: createSchemaContributionProvenance(
							applicationSchemaContributionOwner,
							`schema-option:${className}.${name}`,
						),
					}),
				]),
			),
		),
		patches: immutableArray([]),
		schema,
	})
}
