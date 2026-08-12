import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	isReservedQueryLogicalFieldName,
	isReservedSchemaModelFieldName,
} from '../../schema/schema/reserved-field-names.js'
import { reservedSystemFieldNames } from '../../schema/schema/system-fields.js'
import type {
	SchemaCompilerExtensionNode,
	SchemaCompilerPatchOperation,
} from './contracts.js'
import {
	appendCompilerPatchProvenance,
	sameCompilerOwner,
	withoutCompilerRecordKey,
} from './canonical-state.js'
import type { CanonicalSchemaOperationContext } from './canonical-operation-context.js'
import {
	assertCompilerTarget,
	operationContributionProvenance,
} from './canonical-operation-context.js'

const applyConstraintOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	if (
		operation.kind !== 'constraint:add' &&
		operation.kind !== 'constraint:replace' &&
		operation.kind !== 'constraint:remove'
	) {
		return false
	}
	const { state } = context
	const provenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)
	if (operation.kind === 'constraint:add') {
		state.constraints = immutableArray([
			...state.constraints,
			immutableRecord({ ...operation.constraint, provenance }),
		])
	} else {
		const position = state.constraints.findIndex(
			(entry) =>
				sameCompilerOwner(entry.provenance.owner, operation.target.owner) &&
				entry.provenance.contributionId === operation.target.contributionId,
		)
		const current = state.constraints[position]
		if (current === undefined) {
			throw new TypeError('Stale schema constraint identity')
		}
		assertCompilerTarget(
			current.artifact,
			current.provenance,
			operation.target,
			`${state.className}.constraints[${String(position)}]`,
		)
		state.constraints = immutableArray(
			operation.kind === 'constraint:remove'
				? state.constraints.filter((_, index) => index !== position)
				: state.constraints.map((entry, index) =>
						index === position
							? immutableRecord({ ...operation.constraint, provenance })
							: entry,
					),
		)
	}
	state.provenance = immutableRecord({
		...state.provenance,
		constraints: immutableArray(
			state.constraints.map((entry) =>
				immutableRecord({
					definition: entry.definition,
					provenance: entry.provenance,
				}),
			),
		),
	})
	appendCompilerPatchProvenance(state, operation.kind, provenance)
	return true
}

const removeExtensionFields = (
	context: CanonicalSchemaOperationContext,
	extension: SchemaCompilerExtensionNode,
	replacement: SchemaCompilerExtensionNode | undefined,
): void => {
	const replacementNames = new Set(
		replacement?.fields.map(({ name }) => name) ?? [],
	)
	const removedNames = new Set(
		extension.fields
			.map(({ name }) => name)
			.filter((name) => !replacementNames.has(name)),
	)
	for (const index of context.state.indexes) {
		const dependency = index.definition.fields.find((name) =>
			removedNames.has(name),
		)
		if (dependency !== undefined) {
			throw new TypeError(
				`Cannot remove schema extension field with a remaining index: ${dependency}`,
			)
		}
	}
	for (const { name } of extension.fields) {
		context.state.fields = immutableArray(
			context.state.fields.filter((field) => field.name !== name),
		)
		context.state.provenance = immutableRecord({
			...context.state.provenance,
			fieldOptions: withoutCompilerRecordKey(
				context.state.provenance.fieldOptions,
				name,
			),
			fields: withoutCompilerRecordKey(context.state.provenance.fields, name),
		})
	}
}

const addExtensionFields = (
	context: CanonicalSchemaOperationContext,
	extension: SchemaCompilerExtensionNode,
	contributionId: string,
): SchemaCompilerExtensionNode => {
	const provenance = operationContributionProvenance(context, contributionId)
	const fields = immutableArray(
		extension.fields.map((declared) => {
			const { name } = declared
			if (
				context.state.fields.some((field) => field.name === name) ||
				reservedSystemFieldNames.includes(name as never) ||
				isReservedQueryLogicalFieldName(name) ||
				isReservedSchemaModelFieldName(name)
			) {
				throw new TypeError(`Reserved schema extension field: ${name}`)
			}
			const fieldProvenance = operationContributionProvenance(
				context,
				`${contributionId}:field:${name}`,
			)
			const field = immutableRecord({
				...declared,
				fields: immutableArray(declared.fields),
				name,
				options: immutableArray(
					declared.options.map((option) =>
						immutableRecord({
							...option,
							provenance: immutableRecord({
								definition: provenance,
								value: provenance,
							}),
						}),
					),
				),
				provenance: fieldProvenance,
			})
			context.state.fields = immutableArray([...context.state.fields, field])
			context.state.provenance = immutableRecord({
				...context.state.provenance,
				fieldOptions: immutableRecord({
					...context.state.provenance.fieldOptions,
					[name]: immutableRecord(
						Object.fromEntries(
							field.options.map((option) => [option.name, option.provenance]),
						),
					),
				}),
				fields: immutableRecord({
					...context.state.provenance.fields,
					[name]: field.provenance,
				}),
			})
			return field
		}),
	)
	return immutableRecord({ ...extension, fields, provenance })
}

const applyExtensionOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean => {
	if (
		operation.kind !== 'extension:add' &&
		operation.kind !== 'extension:replace' &&
		operation.kind !== 'extension:remove'
	) {
		return false
	}
	const { state } = context
	const provenance = operationContributionProvenance(
		context,
		operation.contributionId,
	)
	let position = -1
	let current: SchemaCompilerExtensionNode | undefined
	if (operation.kind !== 'extension:add') {
		position = state.extensions.findIndex(
			(entry) =>
				sameCompilerOwner(entry.provenance.owner, operation.target.owner) &&
				entry.provenance.contributionId === operation.target.contributionId,
		)
		current = state.extensions[position]
		if (current === undefined) {
			throw new TypeError('Stale schema extension identity')
		}
		assertCompilerTarget(
			current.artifact,
			current.provenance,
			operation.target,
			`${state.className}.extensions[${String(position)}]`,
		)
		removeExtensionFields(
			context,
			current,
			operation.kind === 'extension:replace' ? operation.extension : undefined,
		)
	}
	if (operation.kind === 'extension:remove') {
		state.extensions = immutableArray(
			state.extensions.filter((_, index) => index !== position),
		)
	} else {
		const replacement = addExtensionFields(
			context,
			operation.extension,
			operation.contributionId,
		)
		state.extensions = immutableArray(
			operation.kind === 'extension:add'
				? [...state.extensions, replacement]
				: state.extensions.map((entry, index) =>
						index === position ? replacement : entry,
					),
		)
	}
	state.provenance = immutableRecord({
		...state.provenance,
		extensions: immutableArray(
			state.extensions.map((entry) =>
				immutableRecord({ name: entry.name, provenance: entry.provenance }),
			),
		),
	})
	appendCompilerPatchProvenance(state, operation.kind, provenance)
	return true
}

/** Applies extension and portable-constraint operations directly to IR state. */
export const applyCanonicalArtifactOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): boolean =>
	applyConstraintOperation(context, operation) ||
	applyExtensionOperation(context, operation)
