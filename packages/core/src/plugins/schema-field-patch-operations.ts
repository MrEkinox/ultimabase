import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { assertExactPlainObject } from '../exact-object-validation.js'
import {
	assertFieldDefinition,
	forbidFieldMutationInput,
} from '../schema/fields/base/definition.js'
import type {
	ForbiddenMutationInputField,
	GenericField,
} from '../schema/fields/base/contract.js'

import { snapshotCapturedOptionValue } from '../schema/schema/captured-options.js'
import { isSchemaConstraintDefinition } from '../schema/schema/constraints.js'

import {
	type AddSchemaConstraintOperation,
	type AddSchemaFieldOperation,
	type AddSchemaFieldOptions,
	type AddSchemaIndexOperation,
	type SchemaPatchOperation,
	schemaPatchOperations,
	type SetSchemaFieldOptionOperation,
	type SetSchemaOptionOperation,
} from './schema-patch-contracts.js'

/** Marks one operation as created by a Core patch factory. */
const registerPatchOperation = <TOperation extends SchemaPatchOperation>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

export const addSchemaField = <
	const TName extends string,
	const TField extends GenericField,
	const TMutationInput extends 'forbidden' | undefined = undefined,
>(
	options: AddSchemaFieldOptions<TName, TField> &
		Readonly<{ mutationInput?: TMutationInput }>,
): AddSchemaFieldOperation<
	TName,
	TMutationInput extends 'forbidden'
		? ForbiddenMutationInputField<TField>
		: TField
> => {
	assertExactPlainObject(
		options,
		new Set(['contributionId', 'field', 'mutationInput', 'name']),
		'Schema field addition must be a plain object',
		'Unknown Schema field addition key: ',
	)

	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')
	assertFieldDefinition(options.field, `Schema field ${options.name}`)
	const mutationInput: unknown = options.mutationInput
	if (mutationInput !== undefined && mutationInput !== 'forbidden') {
		throw new TypeError('Schema field mutationInput must be forbidden')
	}

	return registerPatchOperation(
		immutableRecord({
			contributionId: options.contributionId,
			field:
				mutationInput === 'forbidden'
					? forbidFieldMutationInput(options.field)
					: options.field,
			kind: 'field:add' as const,
			name: options.name,
		}),
	) as AddSchemaFieldOperation<
		TName,
		TMutationInput extends 'forbidden'
			? ForbiddenMutationInputField<TField>
			: TField
	>
}

export const addSchemaIndex = (
	options: Omit<AddSchemaIndexOperation, 'kind' | 'index'> & {
		readonly fields: readonly [string, string, ...string[]]
		readonly unique?: boolean
	},
): AddSchemaIndexOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema index addition must be a plain object')
	}

	assertNonEmptyString(options.contributionId, 'Schema index contributionId')
	const index = immutableRecord({
		fields: immutableArray(options.fields),
		...(options.unique === undefined ? {} : { unique: options.unique }),
	})
	return registerPatchOperation(
		immutableRecord({
			contributionId: options.contributionId,
			index,
			kind: 'index:add' as const,
		}),
	)
}

export const setSchemaOption = (
	options: Omit<SetSchemaOptionOperation, 'kind'>,
): SetSchemaOptionOperation => {
	// Additive setters cannot accept the retired existing-owner replacement target.
	assertExactPlainObject(
		options,
		new Set(['contributionId', 'name', 'value']),
		'Schema option patch must be a plain object',
		'Unknown Schema option patch key: ',
	)
	assertNonEmptyString(options.contributionId, 'Schema option contributionId')
	assertNonEmptyString(options.name, 'Schema option name')

	return registerPatchOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'schema-option:set',
			name: options.name,
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}

export const setSchemaFieldOption = (
	options: Omit<SetSchemaFieldOptionOperation, 'kind'>,
): SetSchemaFieldOptionOperation => {
	assertExactPlainObject(
		options,
		new Set(['contributionId', 'field', 'name', 'value']),
		'Schema field option patch must be a plain object',
		'Unknown Schema field option patch key: ',
	)
	assertNonEmptyString(
		options.contributionId,
		'Schema field option contributionId',
	)
	assertNonEmptyString(options.field, 'Schema field option field')
	assertNonEmptyString(options.name, 'Schema field option name')

	return registerPatchOperation(
		immutableRecord({
			contributionId: options.contributionId,
			field: options.field,
			kind: 'field-option:set',
			name: options.name,
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}

export const addSchemaConstraint = (
	options: Omit<AddSchemaConstraintOperation, 'kind'>,
): AddSchemaConstraintOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema constraint addition must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema constraint contributionId',
	)
	if (!isSchemaConstraintDefinition(options.constraint)) {
		throw new TypeError(
			'Schema constraint must be created by defineSchemaConstraint',
		)
	}

	return registerPatchOperation(
		immutableRecord({
			constraint: options.constraint,
			contributionId: options.contributionId,
			kind: 'constraint:add',
		}),
	)
}
