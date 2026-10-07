import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { PreparedSchemaCompilation } from '../schema/schema/definition.js'

import {
	createSchemaContributionProvenance,
	type SchemaCompilationProvenance,
	type SchemaContributionProvenance,
} from '../schema/schema/provenance.js'

import {
	type OptionDefinitionIndex,
	optionDefinitionProvenance,
	type OwnedSchemaSource,
	resolveOptionDefinition,
} from './schema-declaration-contracts.js'

import { coreSchemaKeys } from '../schema/schema/registry.js'

export const attachInitialContributionProvenance = (
	candidate: PreparedSchemaCompilation,
	source: OwnedSchemaSource | undefined,
	definitions: OptionDefinitionIndex,
): PreparedSchemaCompilation => {
	const original = candidate.definition.provenance

	if (source === undefined) {
		const fieldOptions = immutableRecord(
			Object.fromEntries(
				Object.entries(original.fieldOptions).map(
					([fieldName, optionProvenance]) => [
						fieldName,
						immutableRecord(
							Object.fromEntries(
								Object.entries(optionProvenance).map(
									([optionName, provenance]) => {
										const descriptor = resolveOptionDefinition(
											definitions.field,
											optionName,
											`${candidate.schema.className}.fields.${fieldName}.options.${optionName}`,
										)

										return [
											optionName,
											descriptor === undefined
												? provenance
												: immutableRecord({
														...provenance,
														definition: optionDefinitionProvenance(descriptor),
													}),
										]
									},
								),
							),
						),
					],
				),
			),
		)
		const options = immutableRecord(
			Object.fromEntries(
				Object.entries(original.options).map(([name, provenance]) => {
					const descriptor = resolveOptionDefinition(
						definitions.schema,
						name,
						`${candidate.schema.className}.${name}`,
					)

					return [
						name,
						descriptor === undefined
							? provenance
							: immutableRecord({
									...provenance,
									definition: optionDefinitionProvenance(descriptor),
								}),
					]
				}),
			),
		)
		const provenance = immutableRecord({
			...original,
			fieldOptions,
			options,
		})

		return immutableRecord({
			...candidate,
			definition:
				provenance === original
					? candidate.definition
					: immutableRecord({ ...candidate.definition, provenance }),
		})
	}

	const sourceOwner = source.owner
	const sourceStaticOptions = source.staticOptions
	const sourceId = source.contributionId
	const requireProvenance = (
		value: SchemaContributionProvenance | undefined,
		path: string,
	): SchemaContributionProvenance => {
		if (value === undefined) {
			throw new TypeError(`Missing schema provenance: ${path}`)
		}
		return value
	}
	const fields: SchemaCompilationProvenance['fields'] = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.definition.fields).map((name) => {
				const originalField = requireProvenance(
					original.fields[name],
					`${candidate.schema.className}.fields.${name}`,
				)
				const isCore = originalField.owner.kind === 'core'
				return [
					name,
					isCore
						? originalField
						: createSchemaContributionProvenance(
								sourceOwner,
								`${sourceId}:field:${name}`,
								sourceStaticOptions,
							),
				]
			}),
		),
	)
	const fieldOptions: SchemaCompilationProvenance['fieldOptions'] =
		immutableRecord(
			Object.fromEntries(
				Object.entries(candidate.definition.fields).map(
					([fieldName, field]) => {
						const fieldOwner = requireProvenance(
							fields[fieldName] ?? original.fields[fieldName],
							`${candidate.schema.className}.fields.${fieldName}`,
						)
						return [
							fieldName,
							immutableRecord(
								Object.fromEntries(
									Object.keys(field.options).map((optionName) => {
										const descriptor = resolveOptionDefinition(
											definitions.field,
											optionName,
											`${candidate.schema.className}.fields.${fieldName}.options.${optionName}`,
											source.owner,
										)
										const prior = original.fieldOptions[fieldName]?.[optionName]
										return [
											optionName,
											immutableRecord({
												definition:
													descriptor === undefined
														? (prior?.definition ?? fieldOwner)
														: optionDefinitionProvenance(descriptor),
												value: createSchemaContributionProvenance(
													fieldOwner.owner,
													`${fieldOwner.contributionId}:option:${optionName}`,
													sourceStaticOptions,
												),
											}),
										]
									}),
								),
							),
						]
					},
				),
			),
		)
	const options: SchemaCompilationProvenance['options'] = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.definition)
				.filter((name) => !coreSchemaKeys.has(name))
				.map((name) => {
					const descriptor = resolveOptionDefinition(
						definitions.schema,
						name,
						`${candidate.schema.className}.${name}`,
						source.owner,
					)
					if (descriptor === undefined) {
						throw new TypeError(`Unknown schema option: ${name}`)
					}
					return [
						name,
						immutableRecord({
							definition: optionDefinitionProvenance(descriptor),
							value: createSchemaContributionProvenance(
								sourceOwner,
								`${sourceId}:option:${name}`,
								sourceStaticOptions,
							),
						}),
					]
				}),
		),
	)
	const provenance: SchemaCompilationProvenance = immutableRecord({
		constraints: immutableArray(
			candidate.definition.constraints.map((definition, index) =>
				immutableRecord({
					definition,
					provenance: createSchemaContributionProvenance(
						sourceOwner,
						`${sourceId}:constraint:${String(index)}`,
						sourceStaticOptions,
					),
				}),
			),
		),
		fieldOptions,
		fields,
		indexes: immutableArray(
			candidate.definition.indexes.map((definition, index) =>
				immutableRecord({
					definition,
					provenance: createSchemaContributionProvenance(
						sourceOwner,
						`${sourceId}:index:${String(index)}`,
						sourceStaticOptions,
					),
				}),
			),
		),
		options,
		patches: original.patches,
		schema: createSchemaContributionProvenance(
			sourceOwner,
			sourceId,
			sourceStaticOptions,
		),
	})

	return immutableRecord({
		...candidate,
		definition: immutableRecord({ ...candidate.definition, provenance }),
	})
}
