import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { assertExactObjectKeys } from '../exact-object-validation.js'
import {
	assertFieldDefinition,
	forbidFieldMutationInput,
} from '../schema/fields/base/definition.js'
import type {
	ForbiddenMutationInputField,
	GenericField,
} from '../schema/fields/base/contract.js'

import { snapshotCapturedOptionValue } from '../schema/schema/captured-options.js'

import {
	type AddSchemaFieldOperation,
	type AddSchemaFieldOptions,
	type AddSchemaIndexOperation,
	schemaPatchOperations,
	type SetSchemaFieldOptionOperation,
	type SetSchemaOptionOperation,
} from './schema-patch-contracts.js'

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
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field addition must be a plain object')
	}
	assertExactObjectKeys(
		options,
		new Set(['contributionId', 'field', 'mutationInput', 'name']),
		'Unknown Schema field addition key: ',
	)

	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')
	assertFieldDefinition(options.field, `Schema field ${options.name}`)
	const mutationInput: unknown = options.mutationInput
	if (mutationInput !== undefined && mutationInput !== 'forbidden') {
		throw new TypeError('Schema field mutationInput must be forbidden')
	}

	const operation = immutableRecord({
		contributionId: options.contributionId,
		field:
			mutationInput === 'forbidden'
				? forbidFieldMutationInput(options.field)
				: options.field,
		kind: 'field:add' as const,
		name: options.name,
	})
	schemaPatchOperations.add(operation)

	return operation as AddSchemaFieldOperation<
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
	const operation = immutableRecord({
		contributionId: options.contributionId,
		index,
		kind: 'index:add' as const,
	})
	schemaPatchOperations.add(operation)

	return operation
}

const defineOptionOperation = <
	TOperation extends SetSchemaFieldOptionOperation | SetSchemaOptionOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

export const setSchemaOption = (
	options: Omit<SetSchemaOptionOperation, 'kind'>,
): SetSchemaOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema option patch must be a plain object')
	}
	// Additive setters cannot accept the retired existing-owner replacement target.
	assertExactObjectKeys(
		options,
		new Set(['contributionId', 'name', 'value']),
		'Unknown Schema option patch key: ',
	)
	assertNonEmptyString(options.contributionId, 'Schema option contributionId')
	assertNonEmptyString(options.name, 'Schema option name')

	return defineOptionOperation(
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
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field option patch must be a plain object')
	}
	assertExactObjectKeys(
		options,
		new Set(['contributionId', 'field', 'name', 'value']),
		'Unknown Schema field option patch key: ',
	)
	assertNonEmptyString(
		options.contributionId,
		'Schema field option contributionId',
	)
	assertNonEmptyString(options.field, 'Schema field option field')
	assertNonEmptyString(options.name, 'Schema field option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			field: options.field,
			kind: 'field-option:set',
			name: options.name,
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}
