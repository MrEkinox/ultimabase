import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	assertFieldDefinition,
	forbidFieldMutationInput,
} from '../schema/fields/base/definition.js'

import { snapshotCapturedOptionValue } from '../schema/schema/captured-options.js'

import {
	applicationSchemaContributionOwner,
	coreSchemaContributionOwner,
	type SchemaContributionOwnerReference,
} from '../schema/schema/provenance.js'

import { assertKnownKeys } from './schema-option-definitions.js'

import {
	type AddSchemaFieldOperation,
	type AddSchemaFieldOptions,
	type AddSchemaIndexOperation,
	schemaPatchOperations,
	type SetSchemaFieldOptionOperation,
	type SetSchemaOptionOperation,
} from './schema-patch-contracts.js'

export const addSchemaField = (
	options: AddSchemaFieldOptions,
): AddSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field addition must be a plain object')
	}
	assertKnownKeys(
		options,
		new Set(['contributionId', 'field', 'mutationInput', 'name']),
		'Schema field addition',
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

	return operation
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

export const normalizeOwnerReference = (
	owner: unknown,
	path: string,
): SchemaContributionOwnerReference => {
	const untrustedOwner: unknown = owner
	if (!isPlainRecord(untrustedOwner)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	if (untrustedOwner.kind === 'application') {
		assertKnownKeys(untrustedOwner, new Set(['kind']), path)
		return applicationSchemaContributionOwner
	}

	if (untrustedOwner.kind === 'core') {
		assertKnownKeys(untrustedOwner, new Set(['kind']), path)
		return coreSchemaContributionOwner
	}

	if (untrustedOwner.kind !== 'plugin') {
		throw new TypeError(`${path}.kind must be application, core, or plugin`)
	}

	assertKnownKeys(
		untrustedOwner,
		new Set(['instanceId', 'kind', 'pluginId']),
		path,
	)
	assertNonEmptyString(untrustedOwner.pluginId, `${path}.pluginId`)
	if (untrustedOwner.instanceId !== undefined) {
		assertNonEmptyString(untrustedOwner.instanceId, `${path}.instanceId`)
	}

	return immutableRecord({
		kind: 'plugin',
		pluginId: untrustedOwner.pluginId,
		...(untrustedOwner.instanceId === undefined
			? {}
			: { instanceId: untrustedOwner.instanceId }),
	})
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
	assertKnownKeys(
		options,
		new Set(['contributionId', 'name', 'value']),
		'Schema option patch',
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
	assertKnownKeys(
		options,
		new Set(['contributionId', 'field', 'name', 'value']),
		'Schema field option patch',
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
