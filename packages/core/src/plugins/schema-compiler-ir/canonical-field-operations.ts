import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	createSchemaContributionProvenance,
	type SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import { reservedSystemFieldNames } from '../../schema/schema/system-fields.js'
import type {
	SchemaCompilerFieldNode,
	SchemaCompilerPatchOperation,
} from './contracts.js'
import {
	appendCompilerPatchProvenance,
	removeNamedNode,
	withoutCompilerRecordKey,
} from './canonical-state.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	assertCompilerTarget,
	operationContributionProvenance,
	resolveCompilerOptionDefinition,
} from './canonical-operation-context.js'

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

const renameIndexField = (
	fields: readonly [string, ...string[]],
	from: string,
	to: string,
): readonly [string, ...string[]] =>
	immutableArray(
		fields.map((field) => (field === from ? to : field)),
	) as readonly [string, ...string[]]

/** Applies field add, replace, rename, and removal directly to IR state. */
export const applyCanonicalFieldOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	const { state } = context
	if (operation.kind === 'field:add') {
		if (state.fields.some(({ name }) => name === operation.name)) {
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
		})
		appendCompilerPatchProvenance(state, operation.kind, field.provenance)
		return true
	}

	if (
		operation.kind !== 'field:replace' &&
		operation.kind !== 'field:rename' &&
		operation.kind !== 'field:remove'
	) {
		return false
	}
	const sourceName =
		operation.kind === 'field:rename' ? operation.from : operation.name
	const position = state.fields.findIndex(({ name }) => name === sourceName)
	const actual = state.fields[position]
	if (actual === undefined) {
		throw new TypeError(
			`Unknown schema field: ${state.className}.${sourceName}`,
		)
	}
	assertCompilerTarget(
		actual.artifact,
		state.provenance.fields[sourceName],
		operation.target,
		`${state.className}.fields.${sourceName}`,
		{ protectCore: true },
	)
	if (reservedSystemFieldNames.includes(sourceName as never)) {
		throw new TypeError(`Protected Core schema field: ${sourceName}`)
	}
	const transformProvenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)

	if (operation.kind === 'field:remove') {
		if (
			state.indexes.some(({ definition }) =>
				definition.fields.includes(sourceName),
			)
		) {
			throw new TypeError(
				`Cannot remove schema field with a remaining index: ${sourceName}`,
			)
		}
		state.fields = removeNamedNode(state.fields, sourceName)
		state.developerFieldNames = immutableArray(
			state.developerFieldNames.filter((name) => name !== sourceName),
		)
		state.provenance = immutableRecord({
			...state.provenance,
			fieldOptions: withoutCompilerRecordKey(
				state.provenance.fieldOptions,
				sourceName,
			),
			fields: withoutCompilerRecordKey(state.provenance.fields, sourceName),
		})
		appendCompilerPatchProvenance(state, operation.kind, transformProvenance)
		return true
	}

	const targetName =
		operation.kind === 'field:rename' ? operation.to : operation.name
	if (
		operation.kind === 'field:rename' &&
		state.fields.some(({ name }) => name === targetName)
	) {
		throw new TypeError(
			`Duplicate schema field: ${state.className}.${targetName}`,
		)
	}
	if (reservedSystemFieldNames.includes(targetName as never)) {
		throw new TypeError(`Reserved schema field: ${targetName}`)
	}
	const declared =
		operation.kind === 'field:replace'
			? attributeCanonicalDeclaredField(
					operation.field,
					context,
					operation.contributionId,
					targetName,
				)
			: immutableRecord({ ...actual, name: targetName })
	const priorOptions = state.provenance.fieldOptions[sourceName] ?? {}
	const replacement = immutableRecord({
		...declared,
		options: immutableArray(
			declared.options.map((option) =>
				immutableRecord({
					...option,
					provenance: immutableRecord({
						definition:
							priorOptions[option.name]?.definition ??
							option.provenance.definition,
						value: operationContributionProvenance(
							context,
							`${operation.contributionId}:option:${option.name}`,
						),
					}),
				}),
			),
		),
		provenance: transformProvenance,
	})
	state.fields = immutableArray(
		state.fields.map((field, index) =>
			index === position ? replacement : field,
		),
	)
	state.developerFieldNames = immutableArray(
		state.developerFieldNames.map((name) =>
			name === sourceName ? targetName : name,
		),
	)
	const indexes =
		operation.kind === 'field:rename'
			? immutableArray(
					state.indexes.map((entry) =>
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
			: state.indexes
	state.indexes = indexes
	state.provenance = immutableRecord({
		...state.provenance,
		fieldOptions: immutableRecord({
			...withoutCompilerRecordKey(state.provenance.fieldOptions, sourceName),
			[targetName]: optionProvenanceRecord(replacement),
		}),
		fields: immutableRecord({
			...withoutCompilerRecordKey(state.provenance.fields, sourceName),
			[targetName]: transformProvenance,
		}),
		indexes: immutableArray(
			indexes.map((entry) =>
				immutableRecord({
					definition: entry.definition,
					provenance: entry.provenance,
				}),
			),
		),
	})
	appendCompilerPatchProvenance(state, operation.kind, transformProvenance)
	return true
}
