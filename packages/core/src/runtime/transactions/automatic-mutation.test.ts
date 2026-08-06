import { FrameworkError } from '../../foundation.js'
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
	options?: unknown,
): DatabaseOperationAst => ({
	kind,
	...(options === undefined ? {} : { options }),
})

describe('automatic mutation transactions', () => {
	it('classifies the complete operation union', () => {
		expect(operationKindsAreExhaustive).toBe(true)
	})

	it.each(mutationKinds)('selects the %s mutation kind', (kind) => {
		const options =
			kind === 'create-many' || kind === 'upsert-many'
				? { atomic: false }
				: undefined

		expect(
			requiresAutomaticMutationTransaction(
				createOperationFixture(kind, options),
			),
		).toBe(true)
	})

	it.each(readKinds)('leaves the %s read kind non-transactional', (kind) => {
		expect(
			requiresAutomaticMutationTransaction(createOperationFixture(kind)),
		).toBe(false)
	})

	it.each(['create-many', 'upsert-many'] as const)(
		'keeps both normalized atomic modes transactional for %s',
		(kind) => {
			for (const atomic of [true, false] as const) {
				expect(
					requiresAutomaticMutationTransaction(
						createOperationFixture(kind, { atomic }),
					),
				).toBe(true)
			}
		},
	)

	it.each(['create-many', 'upsert-many'] as const)(
		'rejects malformed low-level bulk options for %s before execution',
		(kind) => {
			const malformedOptions = [
				undefined,
				null,
				{ atomic: 'yes' },
				{ atomic: true, extra: true },
			] as const

			for (const options of malformedOptions) {
				const operation =
					options === undefined
						? createOperationFixture(kind)
						: createOperationFixture(kind, options)

				expect(() => requiresAutomaticMutationTransaction(operation)).toThrow(
					new FrameworkError(
						'VALIDATION_ERROR',
						'Automatic mutation transaction received non-normalized bulk options.',
						{ publicMessage: 'The operation is invalid.' },
					),
				)
			}
		},
	)
})
