import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import { assertFieldDefinition } from '../schema/fields/base/definition.js'

import type { SchemaIndexDefinition } from '../schema/schema/indexes.js'

import { snapshotCapturedOptionValue } from '../schema/schema/captured-options.js'

import {
	applicationSchemaContributionOwner,
	coreSchemaContributionOwner,
	type SchemaContributionOwnerReference,
} from '../schema/schema/provenance.js'

import { assertKnownKeys } from './schema-option-definitions.js'

import {
	type AddSchemaFieldOperation,
	type AddSchemaIndexOperation,
	type ExistingSchemaContributionTarget,
	type RemoveSchemaFieldOperation,
	type RemoveSchemaFieldOptionOperation,
	type RemoveSchemaIndexOperation,
	type RemoveSchemaOptionOperation,
	type RenameSchemaFieldOperation,
	type ReplaceSchemaFieldOperation,
	type ReplaceSchemaIndexOperation,
	schemaPatchOperations,
	type SetSchemaFieldOptionOperation,
	type SetSchemaOptionOperation,
} from './schema-patch-contracts.js'

export const addSchemaField = (
	options: Omit<AddSchemaFieldOperation, 'kind'>,
): AddSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field addition must be a plain object')
	}

	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')
	assertFieldDefinition(options.field, `Schema field ${options.name}`)

	const operation = immutableRecord({ ...options, kind: 'field:add' as const })
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

const normalizeFieldTarget = (
	target: ExistingSchemaContributionTarget<GenericField>,
	path: string,
): ExistingSchemaContributionTarget<GenericField> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)
	assertFieldDefinition(untrustedTarget.expected, `${path}.expected`)

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: untrustedTarget.expected,
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const normalizeJsonTarget = (
	target: ExistingSchemaContributionTarget<JsonValue>,
	path: string,
): ExistingSchemaContributionTarget<JsonValue> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: snapshotJsonValue(untrustedTarget.expected, `${path}.expected`),
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const normalizeIndexTarget = (
	target: ExistingSchemaContributionTarget<SchemaIndexDefinition>,
	path: string,
): ExistingSchemaContributionTarget<SchemaIndexDefinition> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)
	if (!isPlainRecord(untrustedTarget.expected)) {
		throw new TypeError(`${path}.expected must be a plain object`)
	}
	const expectedFields = untrustedTarget.expected.fields
	if (!isUnknownArray(expectedFields) || expectedFields.length === 0) {
		throw new TypeError(`${path}.expected.fields must be a non-empty list`)
	}
	const fields = expectedFields.map((field, index) => {
		assertNonEmptyString(field, `${path}.expected.fields[${String(index)}]`)
		return field
	})
	if (typeof untrustedTarget.expected.unique !== 'boolean') {
		throw new TypeError(`${path}.expected.unique must be a boolean`)
	}

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: immutableRecord({
			fields: immutableArray(fields) as readonly [string, ...string[]],
			unique: untrustedTarget.expected.unique,
		}),
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const defineFieldTransform = <
	TOperation extends
		| RemoveSchemaFieldOperation
		| RenameSchemaFieldOperation
		| ReplaceSchemaFieldOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

export const replaceSchemaField = (
	options: Omit<ReplaceSchemaFieldOperation, 'kind'>,
): ReplaceSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field replacement must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')
	assertFieldDefinition(options.field, `Schema field ${options.name}`)

	return defineFieldTransform(
		immutableRecord({
			contributionId: options.contributionId,
			field: options.field,
			kind: 'field:replace',
			name: options.name,
			target: normalizeFieldTarget(options.target, 'Schema field target'),
		}),
	)
}

export const renameSchemaField = (
	options: Omit<RenameSchemaFieldOperation, 'kind'>,
): RenameSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field rename must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.from, 'Schema field source name')
	assertNonEmptyString(options.to, 'Schema field target name')

	return defineFieldTransform(
		immutableRecord({
			contributionId: options.contributionId,
			from: options.from,
			kind: 'field:rename',
			target: normalizeFieldTarget(options.target, 'Schema field target'),
			to: options.to,
		}),
	)
}

export const removeSchemaField = (
	options: Omit<RemoveSchemaFieldOperation, 'kind'>,
): RemoveSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field removal must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')

	return defineFieldTransform(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'field:remove',
			name: options.name,
			target: normalizeFieldTarget(options.target, 'Schema field target'),
		}),
	)
}

const defineOptionOperation = <
	TOperation extends
		| RemoveSchemaFieldOptionOperation
		| RemoveSchemaOptionOperation
		| SetSchemaFieldOptionOperation
		| SetSchemaOptionOperation,
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
	assertNonEmptyString(options.contributionId, 'Schema option contributionId')
	assertNonEmptyString(options.name, 'Schema option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'schema-option:set',
			name: options.name,
			...(options.target === undefined
				? {}
				: {
						target: normalizeJsonTarget(options.target, 'Schema option target'),
					}),
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}

export const removeSchemaOption = (
	options: Omit<RemoveSchemaOptionOperation, 'kind'>,
): RemoveSchemaOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema option removal must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema option contributionId')
	assertNonEmptyString(options.name, 'Schema option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'schema-option:remove',
			name: options.name,
			target: normalizeJsonTarget(options.target, 'Schema option target'),
		}),
	)
}

export const setSchemaFieldOption = (
	options: Omit<SetSchemaFieldOptionOperation, 'kind'>,
): SetSchemaFieldOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field option patch must be a plain object')
	}
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
			...(options.target === undefined
				? {}
				: {
						target: normalizeJsonTarget(
							options.target,
							'Schema field option target',
						),
					}),
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}

export const removeSchemaFieldOption = (
	options: Omit<RemoveSchemaFieldOptionOperation, 'kind'>,
): RemoveSchemaFieldOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field option removal must be a plain object')
	}
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
			kind: 'field-option:remove',
			name: options.name,
			target: normalizeJsonTarget(options.target, 'Schema field option target'),
		}),
	)
}

const defineIndexTransform = <
	TOperation extends ReplaceSchemaIndexOperation | RemoveSchemaIndexOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

export const replaceSchemaIndex = (
	options: Omit<ReplaceSchemaIndexOperation, 'kind' | 'index'> & {
		readonly fields: readonly [string, string, ...string[]]
		readonly unique?: boolean
	},
): ReplaceSchemaIndexOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema index replacement must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema index contributionId')

	return defineIndexTransform(
		immutableRecord({
			contributionId: options.contributionId,
			index: immutableRecord({
				fields: immutableArray(options.fields),
				...(options.unique === undefined ? {} : { unique: options.unique }),
			}),
			kind: 'index:replace',
			target: normalizeIndexTarget(options.target, 'Schema index target'),
		}),
	)
}

export const removeSchemaIndex = (
	options: Omit<RemoveSchemaIndexOperation, 'kind'>,
): RemoveSchemaIndexOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema index removal must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema index contributionId')

	return defineIndexTransform(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'index:remove',
			target: normalizeIndexTarget(options.target, 'Schema index target'),
		}),
	)
}
