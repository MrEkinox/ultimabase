import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { readFieldIndexValue } from '../../schema/schema/indexes.js'
import {
	createSchemaContributionProvenance,
	type SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import { reservedSystemFieldNames } from '../../schema/schema/system-fields.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	operationContributionProvenance,
	resolveCompilerOptionDefinition,
} from './canonical-operation-context.js'
import { appendCompilerPatchProvenance } from './canonical-state.js'
import type {
	SchemaCompilerFieldNode,
	SchemaCompilerPatchOperation,
} from './contracts.js'

const optionProvenanceRecord = (
	field: SchemaCompilerFieldNode,
): Readonly<Record<string, SchemaOptionProvenance>> =>
	immutableRecord(
		Object.fromEntries(
			field.options.map((option) => [option.name, option.provenance]),
		),
	)

export const attributeCanonicalDeclaredField = (
	field: SchemaCompilerFieldNode,
	context: CanonicalSchemaOperationContext,
	contributionId: string,
	name: string,
): SchemaCompilerFieldNode => {
	const provenance = operationContributionProvenance(context, contributionId)
	const options = immutableArray(
		field.options.map((option) => {
			const definition = resolveCompilerOptionDefinition(
				context.definitions,
				'field',
				option.name,
				context.patch.owner,
				`${context.state.className}.fields.${name}.options.${option.name}`,
			)
			return immutableRecord({
				...option,
				provenance: immutableRecord({
					definition:
						definition === undefined
							? option.provenance.definition
							: createSchemaContributionProvenance(
									definition.owner,
									definition.contributionId,
									definition.staticOptions,
									definition.protocolVersion,
								),
					value: operationContributionProvenance(
						context,
						`${contributionId}:option:${option.name}`,
					),
				}),
			})
		}),
	)

	return immutableRecord({
		...field,
		fields: immutableArray(
			field.fields.map((nested) =>
				attributeCanonicalDeclaredField(
					nested,
					context,
					`${contributionId}:field:${nested.name}`,
					nested.name,
				),
			),
		),
		name,
		options,
		provenance,
	})
}

/** Adds fields to IR state while retaining duplicate and protected-field checks. */
export const applyCanonicalFieldOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	const { state } = context
	if (operation.kind === 'field:add') {
		if (
			state.fields.some(({ name }) => name === operation.name) ||
			state.virtualFields.some(({ name }) => name === operation.name)
		) {
			throw new TypeError(
				`Duplicate schema field: ${state.className}.${operation.name}`,
			)
		}
		if (reservedSystemFieldNames.includes(operation.name as never)) {
			throw new TypeError(`Reserved schema field: ${operation.name}`)
		}
		const field = attributeCanonicalDeclaredField(
			operation.field,
			context,
			operation.contributionId,
			operation.name,
		)
		state.fields = immutableArray([...state.fields, field])
		state.developerFieldNames = immutableArray([
			...state.developerFieldNames,
			operation.name,
		])
		const indexed = readFieldIndexValue(
			field.options.find(({ name }) => name === 'indexed')?.value,
		)
		if (indexed !== false) {
			const definition = immutableRecord({
				fields: immutableArray([operation.name]),
				unique: indexed === 'unique',
			})
			state.indexes = immutableArray([
				...state.indexes,
				immutableRecord({ definition, provenance: field.provenance }),
			])
		}
		state.provenance = immutableRecord({
			...state.provenance,
			fieldOptions: immutableRecord({
				...state.provenance.fieldOptions,
				[operation.name]: optionProvenanceRecord(field),
			}),
			fields: immutableRecord({
				...state.provenance.fields,
				[operation.name]: field.provenance,
			}),
			indexes: immutableArray(
				state.indexes.map(({ definition, provenance }) =>
					immutableRecord({ definition, provenance }),
				),
			),
		})
		appendCompilerPatchProvenance(state, operation.kind, field.provenance)
		return true
	}

	return false
}
