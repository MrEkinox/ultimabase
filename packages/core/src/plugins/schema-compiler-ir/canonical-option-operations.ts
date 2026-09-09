import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createSchemaContributionProvenance } from '../../schema/schema/provenance.js'
import type { SchemaCompilerPatchOperation } from './contracts.js'
import {
	appendCompilerPatchProvenance,
	removeNamedNode,
	withoutCompilerRecordKey,
} from './canonical-state.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	assertCompilerOptionTarget,
	operationContributionProvenance,
	resolveCompilerOptionDefinition,
} from './canonical-operation-context.js'

/** Applies normalized schema and field options without executing their definitions. */
export const applyCanonicalOptionOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	const { state } = context
	if (
		operation.kind === 'schema-option:set' ||
		operation.kind === 'schema-option:remove'
	) {
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
		if (operation.kind === 'schema-option:set') {
			if (operation.target === undefined && current !== undefined) {
				throw new TypeError(`Duplicate schema option: ${operation.name}`)
			}
			if (operation.target !== undefined) {
				if (current === undefined) {
					throw new TypeError(`Unknown schema option: ${operation.name}`)
				}
				assertCompilerOptionTarget(
					current.value,
					current.provenance.value,
					operation.target,
					`${state.className}.${operation.name}`,
				)
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
			state.options = immutableArray(
				current === undefined
					? [...state.options, option]
					: state.options.map((candidate) =>
							candidate.name === operation.name ? option : candidate,
						),
			)
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

		if (current === undefined) {
			throw new TypeError(`Unknown schema option: ${operation.name}`)
		}
		assertCompilerOptionTarget(
			current.value,
			current.provenance.value,
			operation.target,
			`${state.className}.${operation.name}`,
		)
		const removalProvenance = operationContributionProvenance(
			context,
			operation.contributionId,
		)
		state.options = removeNamedNode(state.options, operation.name)
		state.provenance = immutableRecord({
			...state.provenance,
			options: withoutCompilerRecordKey(
				state.provenance.options,
				operation.name,
			),
		})
		appendCompilerPatchProvenance(state, operation.kind, removalProvenance)
		return true
	}

	if (
		operation.kind !== 'field-option:set' &&
		operation.kind !== 'field-option:remove'
	) {
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
			`Unknown plugin field option: ${operation.name}; replace the field to change Core-owned validation or metadata`,
		)
	}
	if (!definition.contexts?.includes('stored')) {
		throw new TypeError(
			`Field option "${operation.name}" does not support the stored context`,
		)
	}
	const current = field.options.find(({ name }) => name === operation.name)
	if (operation.kind === 'field-option:set') {
		if (operation.target === undefined && current !== undefined) {
			throw new TypeError(`Duplicate field option: ${operation.name}`)
		}
		if (operation.target !== undefined) {
			if (current === undefined) {
				throw new TypeError(`Unknown field option: ${operation.name}`)
			}
			assertCompilerOptionTarget(
				current.value,
				current.provenance.value,
				operation.target,
				`${state.className}.fields.${operation.field}.options.${operation.name}`,
			)
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
			options: immutableArray(
				current === undefined
					? [...field.options, option]
					: field.options.map((candidate) =>
							candidate.name === operation.name ? option : candidate,
						),
			),
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

	if (current === undefined) {
		throw new TypeError(`Unknown field option: ${operation.name}`)
	}
	assertCompilerOptionTarget(
		current.value,
		current.provenance.value,
		operation.target,
		`${state.className}.fields.${operation.field}.options.${operation.name}`,
	)
	const removalProvenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)
	const replacement = immutableRecord({
		...field,
		options: removeNamedNode(field.options, operation.name),
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
			[operation.field]: withoutCompilerRecordKey(
				state.provenance.fieldOptions[operation.field] ?? {},
				operation.name,
			),
		}),
	})
	appendCompilerPatchProvenance(state, operation.kind, removalProvenance)
	return true
}
