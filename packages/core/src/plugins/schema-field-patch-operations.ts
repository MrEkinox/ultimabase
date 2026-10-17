import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import {
	assertExactPlainObject,
	assertPlainObject,
} from '../exact-object-validation.js'
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
	type CloseSchemaCommandOperation,
	type CloseSchemaCommandOptions,
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
	assertPlainObject(options, 'Schema index addition must be a plain object')

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

/**
 * Closes one generic command of the patched schemas (ADR-0341): transports
 * publish no route or field for it, and every call fails with
 * `VALIDATION_ERROR` (issue `command.closed`, its reason), Master included.
 * The closing plugin's own calls still run it.
 *
 * @example `closeSchemaCommand({ contributionId: 'user-creation', command: 'create', reason: 'Users are created by sign-up.' })`
 */
export const closeSchemaCommand = (
	options: CloseSchemaCommandOptions,
): CloseSchemaCommandOperation => {
	assertExactPlainObject(
		options,
		new Set(['command', 'contributionId', 'reason']),
		'Schema command closure must be a plain object',
		'Unknown Schema command closure key: ',
	)
	assertNonEmptyString(options.contributionId, 'Schema command contributionId')
	const command: unknown = options.command
	if (command !== 'create') {
		throw new TypeError("Schema command closure command must be 'create'")
	}
	const reason: unknown = options.reason
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		throw new TypeError(
			'Schema command closure reason must be a non-empty string',
		)
	}
	return registerPatchOperation(
		immutableRecord({
			command,
			contributionId: options.contributionId,
			kind: 'command:close' as const,
			reason,
		}),
	)
}
