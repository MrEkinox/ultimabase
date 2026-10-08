import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { getDeclaredFieldOptionsContract } from '../../schema/fields/base/definition.js'
import { readFieldIndexValue } from '../../schema/schema/indexes.js'
import type { PreparedSchemaCompilation } from '../../schema/schema/definition.js'
import {
	coreSchemaContributionOwner,
	createSchemaContributionProvenance,
} from '../../schema/schema/provenance.js'
import type {
	SchemaCompilationProvenance,
	SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import { reservedSystemFieldNames } from '../../schema/schema/system-fields.js'
import type {
	OptionDefinitionIndex,
	OwnedSchemaPatch,
} from '../schema-declaration-contracts.js'
import { isSamePluginIdentity } from '../manifest.js'
import {
	optionDefinitionProvenance,
	resolveOptionDefinition,
} from '../schema-declaration-contracts.js'
import type { SchemaPatchOperation } from '../schema-patch-contracts.js'
import type { SchemaCompilationValues } from './values.js'

const assertUnusedContributionId = (
	candidate: PreparedSchemaCompilation,
	patch: OwnedSchemaPatch,
	contributionId: string,
): void => {
	const provenance = candidate.definition.provenance
	const contributions = [
		provenance.schema,
		...Object.values(provenance.fields),
		...provenance.indexes.map((entry) => entry.provenance),
		...provenance.patches.map((entry) => entry.provenance),
	]
	if (
		contributions.some(
			(contribution) =>
				contribution.contributionId === contributionId &&
				contribution.owner.kind === 'plugin' &&
				isSamePluginIdentity(contribution.owner, patch.owner),
		)
	)
		throw new TypeError(
			`Duplicate schema patch contributionId: ${contributionId}`,
		)
}

/** Applies only the five nominal additive operations; logical attribution remains independent. */
export const applySchemaPatchOperation = (
	candidate: PreparedSchemaCompilation,
	patch: OwnedSchemaPatch,
	operation: SchemaPatchOperation,
	definitions: OptionDefinitionIndex,
	values: SchemaCompilationValues,
): PreparedSchemaCompilation => {
	assertUnusedContributionId(candidate, patch, operation.contributionId)
	const { definition } = candidate
	const source = createSchemaContributionProvenance(
		patch.owner,
		operation.contributionId,
		patch.staticOptions,
	)
	let provenance: SchemaCompilationProvenance = definition.provenance
	let next = definition
	let developerFields = candidate.developerFields

	switch (operation.kind) {
		case 'field:add': {
			const { name, field } = operation
			if (Object.hasOwn(definition.fields, name))
				throw new TypeError(
					`Duplicate schema field: ${definition.className}.${name}`,
				)
			if (reservedSystemFieldNames.includes(name as never))
				throw new TypeError(`Reserved schema field: ${name}`)
			const contract = getDeclaredFieldOptionsContract(field)
			const options: Readonly<Record<string, SchemaOptionProvenance>> =
				immutableRecord(
					Object.fromEntries(
						Object.keys(field.options).map((optionName) => {
							const descriptor = resolveOptionDefinition(
								definitions.field,
								optionName,
								`${definition.className}.fields.${name}.options.${optionName}`,
								patch.owner,
							)
							return [
								optionName,
								immutableRecord({
									definition:
										descriptor === undefined
											? createSchemaContributionProvenance(
													contract?.optionKeys.includes(optionName) === true
														? coreSchemaContributionOwner
														: patch.owner,
													`field-option-definition:${field.kind}.${optionName}`,
												)
											: optionDefinitionProvenance(descriptor),
									value: createSchemaContributionProvenance(
										patch.owner,
										`${operation.contributionId}:option:${optionName}`,
										patch.staticOptions,
									),
								}),
							]
						}),
					),
				)
			const indexed = readFieldIndexValue(
				'indexed' in field.options ? field.options.indexed : undefined,
			)
			const indexes = immutableArray([
				...definition.indexes,
				...(indexed === false
					? []
					: [
							immutableRecord({
								fields: immutableArray([name]),
								unique: indexed === 'unique',
							}),
						]),
			])
			provenance = immutableRecord({
				...provenance,
				fields: immutableRecord({ ...provenance.fields, [name]: source }),
				fieldOptions: immutableRecord({
					...provenance.fieldOptions,
					[name]: options,
				}),
				indexes: immutableArray([
					...provenance.indexes,
					...indexes
						.slice(definition.indexes.length)
						.map((index) =>
							immutableRecord({ definition: index, provenance: source }),
						),
				]),
			})
			next = immutableRecord({
				...definition,
				fields: immutableRecord({
					...definition.persistedFields,
					[name]: field,
					...definition.virtualFields,
				}),
				persistedFields: immutableRecord({
					...definition.persistedFields,
					[name]: field,
				}),
				indexes,
			})
			developerFields = immutableRecord({ ...developerFields, [name]: field })
			break
		}
		case 'index:add': {
			const { fields } = operation.index
			if (fields.length < 2)
				throw new TypeError('Composite index must contain at least two fields')
			const known = new Set([
				...Object.entries(definition.persistedFields)
					.filter(([, field]) => field.kind !== 'relation')
					.map(([name]) => name),
				...reservedSystemFieldNames,
			])
			const seen = new Set<string>()
			for (const name of fields) {
				if (!known.has(name))
					throw new TypeError(`Unknown index field: ${name}`)
				if (seen.has(name))
					throw new TypeError(`Duplicate index field: ${name}`)
				seen.add(name)
			}
			const index = immutableRecord({
				fields: immutableArray(fields),
				unique: operation.index.unique ?? false,
			})
			next = immutableRecord({
				...definition,
				indexes: immutableArray([...definition.indexes, index]),
			})
			provenance = immutableRecord({
				...provenance,
				indexes: immutableArray([
					...provenance.indexes,
					immutableRecord({ definition: index, provenance: source }),
				]),
			})
			break
		}
		case 'schema-option:set':
		case 'field-option:set': {
			const scope = operation.kind === 'schema-option:set' ? 'schema' : 'field'
			const field =
				operation.kind === 'field-option:set' &&
				Object.hasOwn(definition.persistedFields, operation.field)
					? definition.persistedFields[operation.field]
					: undefined
			if (operation.kind === 'field-option:set' && field === undefined)
				throw new TypeError(`Unknown schema field: ${operation.field}`)
			const path =
				operation.kind === 'field-option:set'
					? `${definition.className}.fields.${operation.field}.options.${operation.name}`
					: `${definition.className}.${operation.name}`
			const descriptor = resolveOptionDefinition(
				definitions[scope],
				operation.name,
				path,
				patch.owner,
			)
			if (descriptor === undefined)
				throw new TypeError(
					scope === 'schema'
						? `Unknown schema option: ${operation.name}`
						: `Unknown plugin field option: ${operation.name}; Core-owned validation and metadata cannot be patched`,
				)
			if (
				scope === 'field' &&
				(!('contexts' in descriptor.definition) ||
					!descriptor.definition.contexts.includes('stored'))
			)
				throw new TypeError(
					`Field option "${operation.name}" does not support the stored context`,
				)
			const option = immutableRecord({
				definition: optionDefinitionProvenance(descriptor),
				value: source,
			})
			if (operation.kind === 'schema-option:set') {
				if (Object.hasOwn(definition, operation.name))
					throw new TypeError(`Duplicate schema option: ${operation.name}`)
				next = immutableRecord({
					...definition,
					[operation.name]: operation.value,
				})
				provenance = immutableRecord({
					...provenance,
					options: immutableRecord({
						...provenance.options,
						[operation.name]: option,
					}),
				})
			} else if (field !== undefined) {
				if (Object.hasOwn(field.options, operation.name))
					throw new TypeError(`Duplicate field option: ${operation.name}`)
				const replacement = values.withFieldOption(
					field,
					operation.name,
					operation.value,
				)
				next = immutableRecord({
					...definition,
					persistedFields: immutableRecord({
						...definition.persistedFields,
						[operation.field]: replacement,
					}),
					fields: immutableRecord({
						...definition.fields,
						[operation.field]: replacement,
					}),
				})
				if (Object.hasOwn(developerFields, operation.field))
					developerFields = immutableRecord({
						...developerFields,
						[operation.field]: replacement,
					})
				provenance = immutableRecord({
					...provenance,
					fieldOptions: immutableRecord({
						...provenance.fieldOptions,
						[operation.field]: immutableRecord({
							...provenance.fieldOptions[operation.field],
							[operation.name]: option,
						}),
					}),
				})
			}
			break
		}
	}
	provenance = immutableRecord({
		...provenance,
		patches: immutableArray([
			...provenance.patches,
			immutableRecord({
				kind: operation.kind,
				provenance: source,
				targetClassName: definition.className,
			}),
		]),
	})
	return immutableRecord({
		schema: candidate.schema,
		developerFields,
		definition: immutableRecord({ ...next, provenance }),
	})
}
