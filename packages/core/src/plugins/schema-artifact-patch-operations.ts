import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { isSchemaConstraintDefinition } from '../schema/schema/constraints.js'

import {
	type AddSchemaConstraintOperation,
	schemaPatchOperations,
} from './schema-patch-contracts.js'

const defineConstraintOperation = <
	TOperation extends AddSchemaConstraintOperation,
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
