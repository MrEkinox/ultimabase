import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { getDeclaredFieldOptionsContract } from '../schema/fields/base/definition.js'
import { reservedSystemFieldNames } from '../schema/schema/system-fields.js'
import {
	coreSchemaContributionOwner,
	createSchemaContributionProvenance,
	type SchemaOptionProvenance,
} from '../schema/schema/provenance.js'
import { resolveOptionDefinition } from './schema-declaration-contracts.js'
import { resolveFieldOptions } from './schema-option-resolution.js'
import {
	assertExactFieldTransformTarget,
	renameIndexField,
	withoutRecordKey,
	type SchemaTransformationContext,
	type SchemaTransformationState,
} from './schema-transformation-context.js'
import { type SchemaPatchOperation } from './schema-patch-contracts.js'

export const applyFieldOperation = (
	context: SchemaTransformationContext,
	state: SchemaTransformationState,
	operation: SchemaPatchOperation,
): boolean => {
	const { candidate, definitions, patch, resolvedFields } = context
	if (operation.kind === 'field:add') {
		if (Object.hasOwn(state.fields, operation.name)) {
			throw new TypeError(
				`Duplicate schema field: ${candidate.schema.className}.${operation.name}`,
			)
		}
		if (reservedSystemFieldNames.includes(operation.name as never)) {
			throw new TypeError(`Reserved schema field: ${operation.name}`)
		}
		const field = resolveFieldOptions(
			operation.field,
			definitions.field,
			`${candidate.schema.className}.fields.${operation.name}`,
			resolvedFields,
			patch.owner,
		)
		state.fields = immutableRecord({ ...state.fields, [operation.name]: field })
		state.developerFields = immutableRecord({
			...state.developerFields,
			[operation.name]: field,
		})
		const fieldProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		const contract = getDeclaredFieldOptionsContract(field)
		const fieldOptions = immutableRecord(
			Object.fromEntries(
				Object.keys(field.options).map((optionName) => {
					const descriptor = resolveOptionDefinition(
						definitions.field,
						optionName,
						`${candidate.schema.className}.fields.${operation.name}.options.${optionName}`,
						patch.owner,
					)
					const definition =
						descriptor !== undefined
							? createSchemaContributionProvenance(
									descriptor.owner,
									descriptor.contributionId,
									descriptor.staticOptions,
									descriptor.definition.protocolVersion,
								)
							: createSchemaContributionProvenance(
									contract?.optionKeys.includes(optionName) === true
										? coreSchemaContributionOwner
										: patch.owner,
									`${operation.contributionId}:option-definition:${optionName}`,
								)

					return [
						optionName,
						immutableRecord({
							definition,
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
		state.provenance = immutableRecord({
			...state.provenance,
			fieldOptions: immutableRecord({
				...state.provenance.fieldOptions,
				[operation.name]: fieldOptions,
			}),
			fields: immutableRecord({
				...state.provenance.fields,
				[operation.name]: fieldProvenance,
			}),
			patches: immutableArray([
				...state.provenance.patches,
				immutableRecord({
					kind: operation.kind,
					provenance: fieldProvenance,
					targetClassName: candidate.schema.className,
				}),
			]),
		})
		return true
	}

	if (
		operation.kind === 'field:replace' ||
		operation.kind === 'field:rename' ||
		operation.kind === 'field:remove'
	) {
		const sourceName =
			operation.kind === 'field:rename' ? operation.from : operation.name
		const actual = state.fields[sourceName]
		if (actual === undefined) {
			throw new TypeError(
				`Unknown schema field: ${candidate.schema.className}.${sourceName}`,
			)
		}
		assertExactFieldTransformTarget(
			actual,
			state.provenance.fields[sourceName],
			operation.target,
			`${candidate.schema.className}.fields.${sourceName}`,
		)
		if (reservedSystemFieldNames.includes(sourceName as never)) {
			throw new TypeError(`Protected Core schema field: ${sourceName}`)
		}

		const transformProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		const appendPatch = (): void => {
			state.provenance = immutableRecord({
				...state.provenance,
				patches: immutableArray([
					...state.provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: transformProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
		}

		if (operation.kind === 'field:remove') {
			const dependentIndex = state.indexes.find((index) =>
				index.fields.includes(sourceName),
			)
			if (dependentIndex !== undefined) {
				throw new TypeError(
					`Cannot remove schema field with a remaining index: ${sourceName}`,
				)
			}
			state.fields = withoutRecordKey(
				state.fields,
				sourceName,
			) as typeof state.fields
			if (Object.hasOwn(state.developerFields, sourceName)) {
				state.developerFields = withoutRecordKey(
					state.developerFields,
					sourceName,
				)
			}
			state.provenance = immutableRecord({
				...state.provenance,
				fieldOptions: withoutRecordKey(
					state.provenance.fieldOptions,
					sourceName,
				),
				fields: withoutRecordKey(state.provenance.fields, sourceName),
			})
			appendPatch()
			return true
		}

		const targetName =
			operation.kind === 'field:rename' ? operation.to : operation.name
		if (
			operation.kind === 'field:rename' &&
			Object.hasOwn(state.fields, targetName)
		) {
			throw new TypeError(
				`Duplicate schema field: ${candidate.schema.className}.${targetName}`,
			)
		}
		if (reservedSystemFieldNames.includes(targetName as never)) {
			throw new TypeError(`Reserved schema field: ${targetName}`)
		}
		const replacement =
			operation.kind === 'field:replace'
				? resolveFieldOptions(
						operation.field,
						definitions.field,
						`${candidate.schema.className}.fields.${targetName}`,
						resolvedFields,
						patch.owner,
					)
				: actual
		state.fields = immutableRecord(
			Object.fromEntries(
				Object.entries(state.fields).map(([name, field]) => [
					name === sourceName ? targetName : name,
					name === sourceName ? replacement : field,
				]),
			),
		) as typeof state.fields
		if (Object.hasOwn(state.developerFields, sourceName)) {
			state.developerFields = immutableRecord(
				Object.fromEntries(
					Object.entries(state.developerFields).map(([name, field]) => [
						name === sourceName ? targetName : name,
						name === sourceName ? replacement : field,
					]),
				),
			)
		}

		const priorFieldOptions: Readonly<Record<string, SchemaOptionProvenance>> =
			state.provenance.fieldOptions[sourceName] ?? immutableRecord({})
		const replacementFieldOptions = immutableRecord(
			Object.fromEntries(
				Object.keys(replacement.options).map((optionName) => {
					const prior = priorFieldOptions[optionName]
					return [
						optionName,
						immutableRecord({
							definition: prior?.definition ?? transformProvenance,
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
		state.provenance = immutableRecord({
			...state.provenance,
			fieldOptions: immutableRecord({
				...withoutRecordKey(state.provenance.fieldOptions, sourceName),
				[targetName]: replacementFieldOptions,
			}),
			fields: immutableRecord({
				...withoutRecordKey(state.provenance.fields, sourceName),
				[targetName]: transformProvenance,
			}),
			indexes:
				operation.kind === 'field:rename'
					? immutableArray(
							state.provenance.indexes.map((entry) =>
								immutableRecord({
									...entry,
									definition: immutableRecord({
										...entry.definition,
										fields: renameIndexField(
											entry.definition.fields,
											sourceName,
											targetName,
										),
									}),
								}),
							),
						)
					: state.provenance.indexes,
		})
		if (operation.kind === 'field:rename') {
			state.indexes = immutableArray(
				state.indexes.map((index) =>
					immutableRecord({
						...index,
						fields: renameIndexField(index.fields, sourceName, targetName),
					}),
				),
			)
		}
		appendPatch()
		return true
	}

	return false
}
