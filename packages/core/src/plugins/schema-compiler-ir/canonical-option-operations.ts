import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createSchemaContributionProvenance } from '../../schema/schema/provenance.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	operationContributionProvenance,
	resolveCompilerOptionDefinition,
} from './canonical-operation-context.js'
import { appendCompilerPatchProvenance } from './canonical-state.js'
import type { SchemaCompilerPatchOperation } from './contracts.js'

/** Applies normalized schema and field options without executing their definitions. */
export const applyCanonicalOptionOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	const { state } = context
	if (operation.kind === 'schema-option:set') {
		const definition = resolveCompilerOptionDefinition(
			context.definitions,
			'schema',
			operation.name,
			context.patch.owner,
			`${state.className}.${operation.name}`,
		)
		if (definition === undefined) {
			throw new TypeError(`Unknown schema option: ${operation.name}`)
		}
		const current = state.options.find(({ name }) => name === operation.name)

		if (current !== undefined) {
			throw new TypeError(`Duplicate schema option: ${operation.name}`)
		}
		const valueProvenance = operationContributionProvenance(
			context,
			operation.contributionId,
		)
		const option = immutableRecord({
			name: operation.name,
			provenance: immutableRecord({
				definition: createSchemaContributionProvenance(
					definition.owner,
					definition.contributionId,
					definition.staticOptions,
					definition.protocolVersion,
				),
				value: valueProvenance,
			}),
			value: operation.value,
		})
		state.options = immutableArray([...state.options, option])
		state.provenance = immutableRecord({
			...state.provenance,
			options: immutableRecord({
				...state.provenance.options,
				[operation.name]: option.provenance,
			}),
		})
		appendCompilerPatchProvenance(state, operation.kind, valueProvenance)
		return true
	}

	if (operation.kind !== 'field-option:set') {
		return false
	}
	const fieldPosition = state.fields.findIndex(
		({ name }) => name === operation.field,
	)
	const field = state.fields[fieldPosition]
	if (field === undefined) {
		throw new TypeError(`Unknown schema field: ${operation.field}`)
	}
	const definition = resolveCompilerOptionDefinition(
		context.definitions,
		'field',
		operation.name,
		context.patch.owner,
		`${state.className}.fields.${operation.field}.options.${operation.name}`,
	)
	if (definition === undefined) {
		throw new TypeError(
			`Unknown plugin field option: ${operation.name}; Core-owned validation and metadata cannot be patched`,
		)
	}
	if (!definition.contexts?.includes('stored')) {
		throw new TypeError(
			`Field option "${operation.name}" does not support the stored context`,
		)
	}
	const current = field.options.find(({ name }) => name === operation.name)

	if (current !== undefined) {
		throw new TypeError(`Duplicate field option: ${operation.name}`)
	}
	const valueProvenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)
	const option = immutableRecord({
		name: operation.name,
		provenance: immutableRecord({
			definition: createSchemaContributionProvenance(
				definition.owner,
				definition.contributionId,
				definition.staticOptions,
				definition.protocolVersion,
			),
			value: valueProvenance,
		}),
		value: operation.value,
	})
	const replacement = immutableRecord({
		...field,
		options: immutableArray([...field.options, option]),
	})
	state.fields = immutableArray(
		state.fields.map((candidate, index) =>
			index === fieldPosition ? replacement : candidate,
		),
	)
	state.provenance = immutableRecord({
		...state.provenance,
		fieldOptions: immutableRecord({
			...state.provenance.fieldOptions,
			[operation.field]: immutableRecord({
				...state.provenance.fieldOptions[operation.field],
				[operation.name]: option.provenance,
			}),
		}),
	})
	appendCompilerPatchProvenance(state, operation.kind, valueProvenance)
	return true
}
