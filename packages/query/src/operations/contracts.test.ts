import { Schema, intField, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import {
	Query,
	type OperationAst,
	type UpdateExpressionNode,
} from '../index.js'

const articleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

interface FixtureUpdateExpression extends UpdateExpressionNode {
	readonly kind: 'fixture-update'
}

type FixtureOperation = OperationAst<
	typeof articleSchema,
	FixtureUpdateExpression
>

const describeOperation = (operation: FixtureOperation): string => {
	switch (operation.kind) {
		case 'find':
		case 'first':
		case 'get':
		case 'count':
		case 'exists':
			return `read:${operation.kind}`
		case 'create-one':
		case 'update-one':
		case 'upsert-one':
		case 'delete-one':
			return `singular-write:${operation.kind}`
		case 'create-many':
		case 'update-many':
		case 'upsert-many':
		case 'delete-many':
			return `bulk-write:${operation.kind}`
		default:
			// Assigning a future kind to never forces every visitor to be updated.
			return operation satisfies never
	}
}

describe('OperationAst', () => {
	it('supports exhaustive matching across every singular and bulk terminal', () => {
		const query = new Query(articleSchema).equalTo('views', 10).ast
		const schema = query.schema
		const update: FixtureUpdateExpression = { kind: 'fixture-update' }
		const create = { title: 'UltimaBase' }
		const target = {
			kind: 'unique-upsert-target',
			fields: ['id'],
		} as const
		const upsertItem = { query, target, create, update }
		const operations = [
			{ kind: 'find', query },
			{ kind: 'first', query },
			{ kind: 'get', query, id: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a' },
			{ kind: 'count', query },
			{ kind: 'exists', query },
			{ kind: 'create-one', schema, input: create },
			{
				kind: 'create-many',
				schema,
				inputs: [create],
				options: { atomic: true },
			},
			{ kind: 'update-one', query, update },
			{ kind: 'update-many', query, update },
			{ kind: 'upsert-one', query, target, create, update },
			{
				kind: 'upsert-many',
				schema,
				items: [upsertItem],
				options: { atomic: true },
			},
			{ kind: 'delete-one', query },
			{ kind: 'delete-many', query },
		] as const satisfies readonly FixtureOperation[]

		expect(operations.map(describeOperation)).toStrictEqual([
			'read:find',
			'read:first',
			'read:get',
			'read:count',
			'read:exists',
			'singular-write:create-one',
			'bulk-write:create-many',
			'singular-write:update-one',
			'bulk-write:update-many',
			'singular-write:upsert-one',
			'bulk-write:upsert-many',
			'singular-write:delete-one',
			'bulk-write:delete-many',
		])
	})
})
