import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defineExtensions,
	type SchemaExtension,
} from '../schema/extensions/definition.js'

import {
	isSchemaConstraintDefinition,
	type SchemaConstraintDefinition,
} from '../schema/schema/constraints.js'

import { normalizeOwnerReference } from './schema-field-patch-operations.js'

import { assertKnownKeys } from './schema-option-definitions.js'

import {
	type AddSchemaConstraintOperation,
	type AddSchemaExtensionOperation,
	type ExistingSchemaContributionTarget,
	type RemoveSchemaConstraintOperation,
	type RemoveSchemaExtensionOperation,
	type ReplaceSchemaConstraintOperation,
	type ReplaceSchemaExtensionOperation,
	schemaPatchOperations,
} from './schema-patch-contracts.js'

const normalizeSchemaExtensionTarget = (
	target: ExistingSchemaContributionTarget<SchemaExtension<string, object>>,
	path: string,
): ExistingSchemaContributionTarget<SchemaExtension<string, object>> => {
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
	const untrustedExpected: unknown = untrustedTarget.expected
	if (
		!isPlainRecord(untrustedExpected) ||
		untrustedExpected.scope !== 'schema'
	) {
		throw new TypeError(`${path}.expected must be a schema extension`)
	}
	const [expected] = defineExtensions([
		untrustedExpected as unknown as SchemaExtension<string, object>,
	])

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected,
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const defineExtensionOperation = <
	TOperation extends
		| AddSchemaExtensionOperation
		| RemoveSchemaExtensionOperation
		| ReplaceSchemaExtensionOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

export const addSchemaExtension = (
	options: Omit<AddSchemaExtensionOperation, 'kind'>,
): AddSchemaExtensionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema extension addition must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema extension contributionId',
	)
	const untrustedExtension: unknown = options.extension
	if (
		!isPlainRecord(untrustedExtension) ||
		untrustedExtension.scope !== 'schema'
	) {
		throw new TypeError('Schema extension addition requires a schema extension')
	}
	const [extension] = defineExtensions([
		untrustedExtension as unknown as SchemaExtension<string, object>,
	])

	return defineExtensionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			extension,
			kind: 'extension:add',
		}),
	)
}

export const replaceSchemaExtension = (
	options: Omit<ReplaceSchemaExtensionOperation, 'kind'>,
): ReplaceSchemaExtensionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema extension replacement must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema extension contributionId',
	)
	const untrustedExtension: unknown = options.extension
	if (
		!isPlainRecord(untrustedExtension) ||
		untrustedExtension.scope !== 'schema'
	) {
		throw new TypeError(
			'Schema extension replacement requires a schema extension',
		)
	}
	const [extension] = defineExtensions([
		untrustedExtension as unknown as SchemaExtension<string, object>,
	])

	return defineExtensionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			extension,
			kind: 'extension:replace',
			target: normalizeSchemaExtensionTarget(
				options.target,
				'Schema extension target',
			),
		}),
	)
}

export const removeSchemaExtension = (
	options: Omit<RemoveSchemaExtensionOperation, 'kind'>,
): RemoveSchemaExtensionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema extension removal must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema extension contributionId',
	)

	return defineExtensionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'extension:remove',
			target: normalizeSchemaExtensionTarget(
				options.target,
				'Schema extension target',
			),
		}),
	)
}

const normalizeSchemaConstraintTarget = (
	target: ExistingSchemaContributionTarget<SchemaConstraintDefinition>,
	path: string,
): ExistingSchemaContributionTarget<SchemaConstraintDefinition> => {
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
	if (
		!isPlainRecord(untrustedTarget.expected) ||
		!isSchemaConstraintDefinition(untrustedTarget.expected)
	) {
		throw new TypeError(
			`${path}.expected must be created by defineSchemaConstraint`,
		)
	}

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: untrustedTarget.expected,
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const defineConstraintOperation = <
	TOperation extends
		| AddSchemaConstraintOperation
		| RemoveSchemaConstraintOperation
		| ReplaceSchemaConstraintOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
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

	return defineConstraintOperation(
		immutableRecord({
			constraint: options.constraint,
			contributionId: options.contributionId,
			kind: 'constraint:add',
		}),
	)
}

export const replaceSchemaConstraint = (
	options: Omit<ReplaceSchemaConstraintOperation, 'kind'>,
): ReplaceSchemaConstraintOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema constraint replacement must be a plain object')
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

	return defineConstraintOperation(
		immutableRecord({
			constraint: options.constraint,
			contributionId: options.contributionId,
			kind: 'constraint:replace',
			target: normalizeSchemaConstraintTarget(
				options.target,
				'Schema constraint target',
			),
		}),
	)
}

export const removeSchemaConstraint = (
	options: Omit<RemoveSchemaConstraintOperation, 'kind'>,
): RemoveSchemaConstraintOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema constraint removal must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema constraint contributionId',
	)

	return defineConstraintOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'constraint:remove',
			target: normalizeSchemaConstraintTarget(
				options.target,
				'Schema constraint target',
			),
		}),
	)
}
