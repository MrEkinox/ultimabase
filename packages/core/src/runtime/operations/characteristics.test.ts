import type {
	ExecutableOperationAst,
	OperationKind,
} from '../../query/index.js'
import { describe, expect, it } from 'vitest'

import type { DatabaseOperationAst } from '../database/contracts.js'
import {
	isCollectionOperationResult,
	isNullableOperationResult,
	isQueryBackedOperation,
	isRecordOperationResult,
	isRuntimeMutationOperation,
	supportsOperationResultInclusion,
} from './characteristics.js'

type ExpectedOperationCharacteristics = readonly [
	mutation: boolean,
	nullable: boolean,
	collection: boolean,
	record: boolean,
	inclusion: boolean,
	queryBacked: boolean,
]

const expectedByKind = {
	count: [false, false, false, false, false, true],
	'create-many': [true, false, true, true, false, false],
	'create-one': [true, false, false, true, true, false],
	'delete-many': [true, false, true, true, false, true],
	'delete-one': [true, true, false, true, true, true],
	exists: [false, false, false, false, false, true],
	'find-many': [false, false, true, true, true, true],
	'find-one': [false, true, false, true, true, true],
	get: [false, true, false, true, true, true],
	'update-many': [true, false, true, true, false, true],
	'update-one': [true, true, false, true, true, true],
	'upsert-many': [true, false, true, true, false, false],
	'upsert-one': [true, false, false, true, true, true],
} as const satisfies Record<OperationKind, ExpectedOperationCharacteristics>

describe('Runtime operation characteristics', () => {
	it.each(Object.entries(expectedByKind))(
		'classifies every %s trait',
		(
			kind,
			[mutation, nullable, collection, record, inclusion, queryBacked],
		) => {
			const operation: DatabaseOperationAst = { kind: kind as OperationKind }
			const executable = operation as ExecutableOperationAst

			expect(isRuntimeMutationOperation(operation)).toBe(mutation)
			expect(isNullableOperationResult(operation.kind)).toBe(nullable)
			expect(isCollectionOperationResult(operation.kind)).toBe(collection)
			expect(isRecordOperationResult(operation.kind)).toBe(record)
			expect(isQueryBackedOperation(executable)).toBe(queryBacked)
			expect(supportsOperationResultInclusion(operation.kind)).toBe(inclusion)
		},
	)
})
