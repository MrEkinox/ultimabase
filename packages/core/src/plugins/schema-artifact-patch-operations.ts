import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	isSchemaConstraintDefinition,
	type SchemaConstraintDefinition,
} from '../schema/schema/constraints.js'

import { normalizeOwnerReference } from './schema-field-patch-operations.js'

import { assertKnownKeys } from './schema-option-definitions.js'

import {
	type AddSchemaConstraintOperation,
	type ExistingSchemaContributionTarget,
	type RemoveSchemaConstraintOperation,
	type ReplaceSchemaConstraintOperation,
	schemaPatchOperations,
} from './schema-patch-contracts.js'

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
