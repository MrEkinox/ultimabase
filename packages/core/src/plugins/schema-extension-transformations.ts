import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'
import { defineExtensions } from '../schema/extensions/definition.js'
import { assertFieldDefinition } from '../schema/fields/base/definition.js'
import { areSchemaDeclarationValuesCompatible } from '../schema/schema/definition.js'
import { reservedSystemFieldNames } from '../schema/schema/system-fields.js'
import {
	isReservedQueryLogicalFieldName,
	isReservedSchemaModelFieldName,
} from '../schema/schema/reserved-field-names.js'
import { createSchemaContributionProvenance } from '../schema/schema/provenance.js'
import { resolveFieldOptions } from './schema-option-resolution.js'
import { sameOwner } from './schema-selectors.js'
import {
	withoutRecordKey,
	type SchemaTransformationContext,
	type SchemaTransformationState,
} from './schema-transformation-context.js'
import { type SchemaPatchOperation } from './schema-patch-contracts.js'

export const applyExtensionOperation = (
	context: SchemaTransformationContext,
	state: SchemaTransformationState,
	operation: SchemaPatchOperation,
): boolean => {
	const { candidate, definitions, patch, resolvedFields } = context
	if (
		operation.kind === 'extension:add' ||
		operation.kind === 'extension:replace' ||
		operation.kind === 'extension:remove'
	) {
		const targetPosition =
			operation.kind === 'extension:add'
				? -1
				: state.provenance.extensions.findIndex(
						(entry) =>
							sameOwner(entry.provenance.owner, operation.target.owner) &&
							entry.provenance.contributionId ===
								operation.target.contributionId,
					)
		const currentExtension =
			targetPosition < 0 ? undefined : state.extensions[targetPosition]

		if (operation.kind !== 'extension:add') {
			if (currentExtension === undefined) {
				throw new TypeError('Stale schema extension identity')
			}
			if (
				!areSchemaDeclarationValuesCompatible(
					currentExtension,
					operation.target.expected,
				)
			) {
				throw new TypeError('Stale schema extension shape')
			}
		}

		const replacement =
			operation.kind === 'extension:remove' ? undefined : operation.extension
		const removedFieldNames = new Set(
			Object.keys(currentExtension?.fields ?? {}).filter(
				(name) => !Object.hasOwn(replacement?.fields ?? {}, name),
			),
		)
		for (const index of state.indexes) {
			const removedDependency = index.fields.find((name) =>
				removedFieldNames.has(name),
			)
			if (removedDependency !== undefined) {
				throw new TypeError(
					`Cannot remove schema extension field with a remaining index: ${removedDependency}`,
				)
			}
		}

		for (const name of Object.keys(currentExtension?.fields ?? {})) {
			state.fields = withoutRecordKey(state.fields, name) as typeof state.fields
			state.provenance = immutableRecord({
				...state.provenance,
				fieldOptions: withoutRecordKey(state.provenance.fieldOptions, name),
				fields: withoutRecordKey(state.provenance.fields, name),
			})
		}

		const transformProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		if (replacement !== undefined) {
			for (const [name, declaredField] of Object.entries(replacement.fields)) {
				assertNonEmptyString(name, `Schema extension ${replacement.name} field`)
				assertFieldDefinition(
					declaredField,
					`Schema extension ${replacement.name} state.fields.${name}`,
				)
				if (
					Object.hasOwn(state.fields, name) ||
					reservedSystemFieldNames.includes(name as never) ||
					isReservedQueryLogicalFieldName(name) ||
					isReservedSchemaModelFieldName(name)
				) {
					throw new TypeError(`Reserved schema extension field: ${name}`)
				}
				const field = resolveFieldOptions(
					declaredField,
					definitions.field,
					`${candidate.schema.className}.extensions.${replacement.name}.fields.${name}`,
					resolvedFields,
					patch.owner,
				)
				state.fields = immutableRecord({ ...state.fields, [name]: field })
				state.provenance = immutableRecord({
					...state.provenance,
					fieldOptions: immutableRecord({
						...state.provenance.fieldOptions,
						[name]: immutableRecord(
							Object.fromEntries(
								Object.keys(field.options).map((optionName) => [
									optionName,
									immutableRecord({
										definition: transformProvenance,
										value: transformProvenance,
									}),
								]),
							),
						),
					}),
					fields: immutableRecord({
						...state.provenance.fields,
						[name]: createSchemaContributionProvenance(
							patch.owner,
							`${operation.contributionId}:field:${name}`,
							patch.staticOptions,
						),
					}),
				})
			}
		}

		state.extensions = defineExtensions(
			operation.kind === 'extension:add'
				? [...state.extensions, operation.extension]
				: operation.kind === 'extension:remove'
					? state.extensions.filter((_, index) => index !== targetPosition)
					: state.extensions.map((extension, index) =>
							index === targetPosition ? operation.extension : extension,
						),
		)
		const extensionEntries =
			operation.kind === 'extension:add'
				? [
						...state.provenance.extensions,
						immutableRecord({
							name: operation.extension.name,
							provenance: transformProvenance,
						}),
					]
				: operation.kind === 'extension:remove'
					? state.provenance.extensions.filter(
							(_, index) => index !== targetPosition,
						)
					: state.provenance.extensions.map((entry, index) =>
							index === targetPosition
								? immutableRecord({
										name: operation.extension.name,
										provenance: transformProvenance,
									})
								: entry,
						)
		state.provenance = immutableRecord({
			...state.provenance,
			extensions: immutableArray(extensionEntries),
			patches: immutableArray([
				...state.provenance.patches,
				immutableRecord({
					kind: operation.kind,
					provenance: transformProvenance,
					targetClassName: candidate.schema.className,
				}),
			]),
		})
		return true
	}

	return false
}
