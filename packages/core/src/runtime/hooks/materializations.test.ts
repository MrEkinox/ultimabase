import {
	normalizeUpdateExpression,
	QueryBuilder,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type UpdateOneOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import { Schema, stringField, type InferObject } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import type { DatabaseOperationOutcome } from '../database/contracts.js'
import {
	collectMutationAfterItems,
	collectMutationBeforeItems,
} from './materializations.js'

const schema = Schema.define({
	className: 'MutationItemPairs',
	fields: { title: stringField({ validation: { required: true } }) },
})
const schemaNode = new QueryBuilder(schema).ast.schema
const query = new QueryBuilder(schema).ast
const original: InferObject<typeof schema> = {
	createdAt: '2026-08-08T10:00:00.000Z',
	id: '00000000-0000-7000-8000-000000000001',
	title: 'Before',
	updatedAt: '2026-08-08T10:00:00.000Z',
}
const current: InferObject<typeof schema> = {
	...original,
	title: 'After',
	updatedAt: '2026-08-08T10:01:00.000Z',
}

describe('parent mutation item materializations', () => {
	it('builds create candidates before persistence', () => {
		const operation = immutableRecord({
			input: current,
			kind: 'create-one',
			selection: query.selection,
			schema: schemaNode,
		}) satisfies CreateOneOperationAst<typeof schema>

		expect(collectMutationBeforeItems(operation, undefined)).toStrictEqual([
			{ item: current, originalItem: null },
		])
	})

	it('applies scalar updates to one prepared preimage', () => {
		const operation = immutableRecord({
			kind: 'update-one',
			query,
			update: normalizeUpdateExpression(schema, { title: 'After' }),
		}) satisfies UpdateOneOperationAst<typeof schema>

		expect(collectMutationBeforeItems(operation, original)).toStrictEqual([
			{
				item: { ...original, title: 'After' },
				originalItem: original,
			},
		])
		expect(collectMutationBeforeItems(operation, null)).toStrictEqual([])
	})

	it('exposes one delete preimage and keeps atomic upsert unresolved', () => {
		const deletion = immutableRecord({
			kind: 'delete-one',
			query,
		}) satisfies DeleteOneOperationAst<typeof schema>
		const upsert = immutableRecord({
			create: current,
			kind: 'upsert-one',
			query,
			target: immutableRecord({
				fields: ['id'],
				kind: 'unique-upsert-target' as const,
			}),
			update: normalizeUpdateExpression(schema, { title: 'After' }),
		}) satisfies UpsertOneOperationAst<typeof schema>

		expect(collectMutationBeforeItems(deletion, original)).toStrictEqual([
			{ item: null, originalItem: original },
		])
		expect(collectMutationBeforeItems(upsert, undefined)).toStrictEqual([])
	})

	it('builds exact post-persistence pairs independently from selection', () => {
		const outcome = immutableRecord({
			materializations: [
				immutableRecord({
					current,
					kind: 'update' as const,
					previous: original,
				}),
			],
			result: current,
		}) satisfies DatabaseOperationOutcome<UpdateOneOperationAst<typeof schema>>

		expect(collectMutationAfterItems(outcome)).toStrictEqual([
			{ item: current, originalItem: original },
		])
		expect(Object.isFrozen(collectMutationAfterItems(outcome))).toBe(true)
	})
})
