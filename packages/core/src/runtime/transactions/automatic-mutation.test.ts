import { describe, expect, it } from 'vitest'

import type { DatabaseOperationAst } from '../database/contracts.js'
import { requiresAutomaticMutationTransaction } from './automatic-mutation.js'

const mutationKinds = [
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
	'delete-one',
	'delete-many',
] as const satisfies readonly DatabaseOperationAst['kind'][]

const readKinds = [
	'find-many',
	'find-one',
	'get',
	'count',
	'exists',
] as const satisfies readonly DatabaseOperationAst['kind'][]

type ClassifiedOperationKind =
	(typeof mutationKinds)[number] | (typeof readKinds)[number]

// New operation kinds must choose a transaction policy before they can compile.
const operationKindsAreExhaustive: Exclude<
	DatabaseOperationAst['kind'],
	ClassifiedOperationKind
> extends never
	? true
	: false = true

/** Creates only the trusted discriminants consumed by the transaction selector. */
const createOperationFixture = (
	kind: DatabaseOperationAst['kind'],
): DatabaseOperationAst => ({ kind })

describe('automatic mutation transactions', () => {
	it('classifies the complete operation union', () => {
		expect(operationKindsAreExhaustive).toBe(true)
	})

	it.each(mutationKinds)('selects the %s mutation kind', (kind) => {
		expect(
			requiresAutomaticMutationTransaction(createOperationFixture(kind)),
		).toBe(true)
	})

	it.each(readKinds)('leaves the %s read kind non-transactional', (kind) => {
		expect(
			requiresAutomaticMutationTransaction(createOperationFixture(kind)),
		).toBe(false)
	})
})
