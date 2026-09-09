import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { replaceDeclaredFieldOptions } from '../schema/fields/base/definition.js'
import { createSchemaContributionProvenance } from '../schema/schema/provenance.js'
import { resolveOptionDefinition } from './schema-declaration-contracts.js'
import { normalizeOwnedOptionValue } from './schema-option-resolution.js'
import { readPlainRecordValue } from './schema-selectors.js'
import {
	assertExactJsonTransformTarget,
	withoutRecordKey,
	type SchemaTransformationContext,
	type SchemaTransformationState,
} from './schema-transformation-context.js'
import { type SchemaPatchOperation } from './schema-patch-contracts.js'

export const applyOptionOperation = (
	context: SchemaTransformationContext,
	state: SchemaTransformationState,
	operation: SchemaPatchOperation,
): boolean => {
	const { candidate, definitions, patch } = context
	if (
		operation.kind === 'schema-option:set' ||
		operation.kind === 'schema-option:remove'
	) {
		const descriptor = resolveOptionDefinition(
			definitions.schema,
			operation.name,
			`${candidate.schema.className}.${operation.name}`,
			patch.owner,
		)
		if (descriptor === undefined) {
			throw new TypeError(`Unknown schema option: ${operation.name}`)
		}
		if (
			descriptor.scope !== 'field' ||
			!('contexts' in descriptor.definition) ||
			!descriptor.definition.contexts.includes('stored')
		) {
			throw new TypeError(
				`Field option "${operation.name}" from ${descriptor.owner.pluginId} does not support the stored context`,
			)
		}
		const hasValue = Object.hasOwn(state.schemaOptionValues, operation.name)
		const currentValue = Reflect.get(state.schemaOptionValues, operation.name)
		const currentProvenance = state.provenance.options[operation.name]

		if (operation.kind === 'schema-option:set') {
			if (operation.target === undefined && hasValue) {
				throw new TypeError(`Duplicate schema option: ${operation.name}`)
			}
			if (operation.target !== undefined) {
				if (!hasValue) {
					throw new TypeError(`Unknown schema option: ${operation.name}`)
				}
				assertExactJsonTransformTarget(
					currentValue,
					currentProvenance?.value,
					operation.target,
					`${candidate.schema.className}.${operation.name}`,
				)
			}
			const value = normalizeOwnedOptionValue(
				descriptor,
				operation.value,
				`${candidate.schema.className}.${operation.name}`,
			)
			state.schemaOptionValues = immutableRecord({
				...state.schemaOptionValues,
				[operation.name]: value,
			})
			const valueProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			state.provenance = immutableRecord({
				...state.provenance,
				options: immutableRecord({
					...state.provenance.options,
					[operation.name]: immutableRecord({
						definition: createSchemaContributionProvenance(
							descriptor.owner,
							descriptor.contributionId,
							descriptor.staticOptions,
							descriptor.definition.protocolVersion,
						),
						value: valueProvenance,
					}),
				}),
				patches: immutableArray([
					...state.provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: valueProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			return true
		}

		if (!hasValue) {
			throw new TypeError(`Unknown schema option: ${operation.name}`)
		}
		assertExactJsonTransformTarget(
			currentValue,
			currentProvenance?.value,
			operation.target,
			`${candidate.schema.className}.${operation.name}`,
		)
		const removalProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		state.schemaOptionValues = withoutRecordKey(
			state.schemaOptionValues,
			operation.name,
		)
		state.provenance = immutableRecord({
			...state.provenance,
			options: withoutRecordKey(state.provenance.options, operation.name),
			patches: immutableArray([
				...state.provenance.patches,
				immutableRecord({
					kind: operation.kind,
					provenance: removalProvenance,
					targetClassName: candidate.schema.className,
				}),
			]),
		})
		return true
	}

	if (
		operation.kind === 'field-option:set' ||
		operation.kind === 'field-option:remove'
	) {
		const field = state.fields[operation.field]
		if (field === undefined) {
			throw new TypeError(`Unknown schema field: ${operation.field}`)
		}
		const descriptor = resolveOptionDefinition(
			definitions.field,
			operation.name,
			`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
			patch.owner,
		)
		if (descriptor === undefined) {
			throw new TypeError(
				`Unknown plugin field option: ${operation.name}; replace the field to change Core-owned validation or metadata`,
			)
		}
		const hasValue = Object.hasOwn(field.options, operation.name)
		const currentValue = readPlainRecordValue(
			field.options,
			operation.name,
			`${candidate.schema.className}.fields.${operation.field}.options`,
		)
		const currentProvenance =
			state.provenance.fieldOptions[operation.field]?.[operation.name]
		const options: Readonly<Record<string, unknown>> = immutableRecord(
			Object.fromEntries(Object.entries(field.options)),
		)

		if (operation.kind === 'field-option:set') {
			if (operation.target === undefined && hasValue) {
				throw new TypeError(`Duplicate field option: ${operation.name}`)
			}
			if (operation.target !== undefined) {
				if (!hasValue) {
					throw new TypeError(`Unknown field option: ${operation.name}`)
				}
				assertExactJsonTransformTarget(
					currentValue,
					currentProvenance?.value,
					operation.target,
					`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
				)
			}
			const value = normalizeOwnedOptionValue(
				descriptor,
				operation.value,
				`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
			)
			const replacement = replaceDeclaredFieldOptions(
				field,
				immutableRecord({ ...options, [operation.name]: value }),
			)
			state.fields = immutableRecord({
				...state.fields,
				[operation.field]: replacement,
			})
			if (Object.hasOwn(state.developerFields, operation.field)) {
				state.developerFields = immutableRecord({
					...state.developerFields,
					[operation.field]: replacement,
				})
			}
			const valueProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			state.provenance = immutableRecord({
				...state.provenance,
				fieldOptions: immutableRecord({
					...state.provenance.fieldOptions,
					[operation.field]: immutableRecord({
						...state.provenance.fieldOptions[operation.field],
						[operation.name]: immutableRecord({
							definition: createSchemaContributionProvenance(
								descriptor.owner,
								descriptor.contributionId,
								descriptor.staticOptions,
								descriptor.definition.protocolVersion,
							),
							value: valueProvenance,
						}),
					}),
				}),
				patches: immutableArray([
					...state.provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: valueProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			return true
		}

		if (!hasValue) {
			throw new TypeError(`Unknown field option: ${operation.name}`)
		}
		assertExactJsonTransformTarget(
			currentValue,
			currentProvenance?.value,
			operation.target,
			`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
		)
		const replacement = replaceDeclaredFieldOptions(
			field,
			withoutRecordKey(options, operation.name),
		)
		state.fields = immutableRecord({
			...state.fields,
			[operation.field]: replacement,
		})
		if (Object.hasOwn(state.developerFields, operation.field)) {
			state.developerFields = immutableRecord({
				...state.developerFields,
				[operation.field]: replacement,
			})
		}
		const removalProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		state.provenance = immutableRecord({
			...state.provenance,
			fieldOptions: immutableRecord({
				...state.provenance.fieldOptions,
				[operation.field]: withoutRecordKey(
					state.provenance.fieldOptions[operation.field] ?? immutableRecord({}),
					operation.name,
				),
			}),
			patches: immutableArray([
				...state.provenance.patches,
				immutableRecord({
					kind: operation.kind,
					provenance: removalProvenance,
					targetClassName: candidate.schema.className,
				}),
			]),
		})
		return true
	}

	return false
}
