import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	QueryBuilder,
	type CreateOneOperationAst,
	type DeleteManyOperationAst,
	type FindManyOperationAst,
} from '../../query/index.js'
import { jsonField, Schema, stringField } from '../../schema/index.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import type { DatabaseOperationOutcome } from '../database/contracts.js'
import { TransactionHookJournal } from './transaction-journal.js'

const fixedInstant = '2026-08-02T00:00:00.000Z'
const generatedId = '0198f090-2a50-7000-8000-000000000099'

const articleSchema = Schema.define({
	className: 'TransactionJournalArticle',
	fields: {
		metadata: jsonField(),
		title: stringField({ validation: { required: true } }),
	},
})

const context = RequestContext.anonymous({
	requestId: 'transaction-journal-1',
	source: requestSources.internal,
})

const createRecord = (title: string) => ({
	createdAt: fixedInstant,
	id: generatedId,
	metadata: { nested: { enabled: true } },
	title,
	updatedAt: fixedInstant,
})

describe('TransactionHookJournal', () => {
	it('retains reservation order across read and mutation completion order', () => {
		const journal = new TransactionHookJournal()
		const mutationRecord = createRecord('stored')
		const mutationOperation = immutableRecord({
			input: mutationRecord,
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(articleSchema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof articleSchema>
		const readOperation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).select({ title: true }).ast,
		})
		const mutationToken = journal.reserve(context)
		const readToken = journal.reserve(context)
		const readRecord = { title: 'read' }
		const readResult = [readRecord]
		const mutationOutcome = {
			materializations: [{ current: mutationRecord, kind: 'create' }],
			result: mutationRecord,
		} satisfies DatabaseOperationOutcome<typeof mutationOperation>

		// Completing in reverse proves order is reserved before asynchronous work.
		journal.succeed(readToken, readOperation, readResult)
		journal.succeed(
			mutationToken,
			mutationOperation,
			mutationRecord,
			mutationOutcome,
		)
		readRecord.title = 'mutated after completion'
		mutationRecord.metadata.nested.enabled = false

		const entries = journal.snapshot()
		const mutationEntry = entries[0]
		const readEntry = entries[1]

		expect(Object.isFrozen(journal)).toBe(true)
		expect(Object.isFrozen(entries)).toBe(true)
		expect(entries.map(({ order }) => order)).toStrictEqual([0, 1])
		expect(mutationEntry).toMatchObject({
			category: 'mutation',
			context,
			operation: {
				input: { metadata: { nested: { enabled: true } }, title: 'stored' },
			},
			result: { metadata: { nested: { enabled: true } }, title: 'stored' },
			status: 'succeeded',
		})
		expect(mutationEntry).not.toHaveProperty('materializations')
		expect(readEntry).toMatchObject({
			category: 'read',
			context,
			result: [{ title: 'read' }],
			status: 'succeeded',
		})

		if (
			mutationEntry?.status !== 'succeeded' ||
			mutationEntry.category !== 'mutation'
		) {
			throw new TypeError('Expected a successful mutation journal entry')
		}

		const metadataChange = mutationEntry.fieldChanges.find(
			({ fieldPath }) => fieldPath[0] === 'metadata',
		)

		expect(Object.isFrozen(mutationEntry)).toBe(true)
		expect(Object.isFrozen(mutationEntry.operation)).toBe(true)
		expect(Object.isFrozen(mutationEntry.result)).toBe(true)
		expect(Object.isFrozen(mutationEntry.fieldChanges)).toBe(true)
		expect(journal.snapshot()[0]).toBe(mutationEntry)
		expect(metadataChange?.change.current).toMatchObject({
			present: true,
			value: { nested: { enabled: true } },
		})

		if (metadataChange?.change.current.present === true) {
			expect(Object.isFrozen(metadataChange.change.current.value)).toBe(true)
		}
	})

	it('retains a policy-projected result after required fields are hidden', () => {
		const journal = new TransactionHookJournal()
		const completeRecord = createRecord('protected')
		const operation = immutableRecord({
			input: completeRecord,
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(articleSchema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof articleSchema>
		const outcome = {
			materializations: [{ current: completeRecord, kind: 'create' }],
			result: completeRecord,
		} satisfies DatabaseOperationOutcome<typeof operation>
		const token = journal.reserve(context)

		journal.succeed(token, operation, { id: generatedId }, outcome)

		expect(journal.snapshot()[0]).toMatchObject({
			category: 'mutation',
			result: { id: generatedId },
			status: 'succeeded',
		})
	})

	it('retains the latest failed operation and enforces token ownership', () => {
		const journal = new TransactionHookJournal()
		const initialOperation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).limit(1).ast,
		}) satisfies FindManyOperationAst<typeof articleSchema>
		const latestOperation = immutableRecord({
			...initialOperation,
			query: new QueryBuilder(articleSchema).limit(2).ast,
		}) satisfies FindManyOperationAst<typeof articleSchema>
		const token = journal.reserve(context)
		const error = new Error('read failed')

		journal.fail(token, latestOperation, error, 'operation')

		const entries = journal.snapshot()

		expect(entries).toHaveLength(1)
		expect(entries[0]).toMatchObject({
			context,
			error,
			operation: { query: { limit: 2 } },
			order: 0,
			phase: 'operation',
			status: 'failed',
		})
		const failedEntry = entries[0]

		if (failedEntry?.status !== 'failed') {
			throw new TypeError('Expected a failed transaction journal entry')
		}

		expect(failedEntry.error).toBe(error)
		expect(() => {
			journal.fail(token, latestOperation, error, 'operation')
		}).toThrow(
			'Transaction hook operation token is foreign or already finalized',
		)

		const foreignJournal = new TransactionHookJournal()
		const foreignToken = foreignJournal.reserve(context)

		expect(() => {
			journal.fail(foreignToken, initialOperation, error, 'operation')
		}).toThrow(
			'Transaction hook operation token is foreign or already finalized',
		)
		foreignJournal.fail(foreignToken, initialOperation, error, 'operation')
	})

	it('rejects premature snapshots and omits field changes for set-based writes', () => {
		const journal = new TransactionHookJournal()
		const operation = immutableRecord({
			kind: 'delete-many',
			query: new QueryBuilder(articleSchema).ast,
		}) satisfies DeleteManyOperationAst<typeof articleSchema>
		const token = journal.reserve(context)

		expect(() => journal.snapshot()).toThrow(
			'Transaction hook journal cannot snapshot pending operations',
		)

		const outcome = immutableRecord({
			materializations: immutableArray([]),
			result: immutableArray([createRecord('deleted')]),
		}) satisfies DatabaseOperationOutcome<typeof operation>

		journal.succeed(token, operation, outcome.result, outcome)

		const entry = journal.snapshot()[0]

		expect(entry).toMatchObject({
			category: 'mutation',
			fieldChanges: [],
			result: outcome.result,
			status: 'succeeded',
		})
	})

	it('accepts only framework-owned request contexts', () => {
		const journal = new TransactionHookJournal()

		expect(() =>
			journal.reserve(
				// @ts-expect-error -- Runtime validation rejects forged contexts.
				{},
			),
		).toThrow('Transaction hook journal context must be a RequestContext')
	})
})
