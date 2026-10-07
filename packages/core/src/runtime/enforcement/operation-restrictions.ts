import { FrameworkError } from '../../foundation.js'
import type {
	ExecutableOperationAst,
	QueryAst,
	QuerySelectedFieldNode,
} from '../../query/index.js'
import { isQueryBackedOperation } from '../operations/characteristics.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'
import type {
	RuntimeEnforcementOperationResult,
	RuntimeLogicalOperationAst,
	RuntimeOperationStageInput,
} from '../pipeline/contracts.js'
import { readEnforcementOperationSchema } from './contribution-evaluation.js'
import { getEnforcementStateSnapshot, type EnforcementState } from './state.js'

const isSystemField = (schema: SchemaDefinition, field: string): boolean => {
	const definition: unknown = schema.persistedFields[field]

	return (
		isPlainRecord(definition) &&
		isPlainRecord(definition.options) &&
		definition.options.system === true
	)
}

/** Produces one stable denial without revealing another policy's permitted set. */
const createRestrictedInputError = (field: string): FrameworkError =>
	new FrameworkError(
		'PERMISSION_DENIED',
		`Mutation input contains restricted field: ${field}`,
		{
			publicMessage: 'The operation is not permitted.',
			internalDetails: { field },
		},
	)

const assertPermittedInputRecord = (
	input: unknown,
	permittedFields: readonly string[],
	schema: SchemaDefinition,
): void => {
	if (!isPlainRecord(input)) {
		return
	}

	for (const field of Object.keys(input)) {
		if (!permittedFields.includes(field) && !isSystemField(schema, field)) {
			throw createRestrictedInputError(field)
		}
	}
}

const assertPermittedUpdate = (
	update: unknown,
	permittedFields: readonly string[],
	schema: SchemaDefinition,
): void => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return
	}

	for (const operation of update.operations) {
		if (
			isPlainRecord(operation) &&
			typeof operation.field === 'string' &&
			!permittedFields.includes(operation.field) &&
			!isSystemField(schema, operation.field)
		) {
			throw createRestrictedInputError(operation.field)
		}
	}
}

/** Applies mutation restrictions without giving policies replacement authority. */
const assertPermittedMutationInput = (
	operation: DatabaseOperationAst,
	permittedFields: readonly string[] | undefined,
	schema: SchemaDefinition,
): void => {
	if (permittedFields === undefined) {
		return
	}
	// Structural validation has already proven the closed executable-operation union.
	const executable = operation as unknown as ExecutableOperationAst

	switch (executable.kind) {
		case 'create-one':
			assertPermittedInputRecord(executable.input, permittedFields, schema)
			break
		case 'create-many':
			for (const input of executable.inputs) {
				assertPermittedInputRecord(input, permittedFields, schema)
			}
			break
		case 'update-one':
		case 'update-many':
			assertPermittedUpdate(executable.update, permittedFields, schema)
			break
		case 'upsert-one':
			assertPermittedInputRecord(executable.create, permittedFields, schema)
			assertPermittedUpdate(executable.update, permittedFields, schema)
			break
		case 'upsert-many':
			for (const item of executable.items) {
				assertPermittedInputRecord(item.create, permittedFields, schema)
				assertPermittedUpdate(item.update, permittedFields, schema)
			}
			break
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			break
	}
}

const createSelectedField = (field: string): QuerySelectedFieldNode =>
	immutableRecord({ field, kind: 'selected-field' })

/** Intersects explicit selections and materializes implicit select-all safely. */
const restrictQuerySelection = (
	query: QueryAst,
	permittedFields: readonly string[],
): QueryAst => {
	const selection = restrictSelection(query.selection, permittedFields)

	return immutableRecord({
		...query,
		selection,
	})
}

/** Intersects one normalized selection without coupling it to a QueryBuilder container. */
const restrictSelection = (
	selection: QueryAst['selection'],
	permittedFields: readonly string[],
): QueryAst['selection'] => {
	const requestedFields = selection.fields.map(({ field }) => field)
	const selectedFields =
		requestedFields.length === 0
			? permittedFields
			: requestedFields.filter((field) => permittedFields.includes(field))

	return immutableRecord({
		fields: immutableArray(selectedFields.map(createSelectedField)),
		kind: 'selection',
	})
}

/** Rewrites only query selections while preserving the exact terminal shape. */
const restrictOperationSelection = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	operation: TOperation,
	permittedFields: readonly string[] | undefined,
): TOperation => {
	if (permittedFields === undefined) {
		return operation
	}
	if (operation.kind === 'plugin-schema-mutation') {
		return immutableRecord({
			...operation,
			query: restrictQuerySelection(operation.query, permittedFields),
		})
	}
	// The pipeline accepts only normalized executable operations at this point.
	const executable = operation as unknown as ExecutableOperationAst
	// Scalar terminals have no record projection for a field policy to narrow.
	if (executable.kind === 'count' || executable.kind === 'exists') {
		return operation
	}

	if (isQueryBackedOperation(executable)) {
		return immutableRecord({
			...operation,
			query: restrictQuerySelection(executable.query, permittedFields),
		})
	}

	if (executable.kind === 'create-one' || executable.kind === 'create-many') {
		return immutableRecord({
			...operation,
			selection: restrictSelection(executable.selection, permittedFields),
		})
	}

	return immutableRecord({
		...operation,
		selection: restrictSelection(executable.selection, permittedFields),
		items: immutableArray(
			executable.items.map((item) =>
				immutableRecord({
					...item,
					query: restrictQuerySelection(item.query, permittedFields),
				}),
			),
		),
	})
}

/** Reapplies the immutable plan after business transforms without reevaluation. */
export const enforceOperationRestrictions = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): RuntimeEnforcementOperationResult<TOperation> => {
	const schema = readEnforcementOperationSchema(input.operation)
	const snapshot = getEnforcementStateSnapshot(input.enforcement)

	if (input.operation.kind !== 'plugin-schema-mutation') {
		assertPermittedMutationInput(input.operation, snapshot.inputFields, schema)
	}

	return immutableRecord({
		constraints: snapshot.constraints,
		operation: restrictOperationSelection(
			input.operation,
			snapshot.selectionFields,
		),
		...(snapshot.rowFilter === undefined
			? {}
			: { rowFilter: snapshot.rowFilter }),
		...(snapshot.relationPredicates.length === 0
			? {}
			: { relationPredicates: snapshot.relationPredicates }),
	})
}
