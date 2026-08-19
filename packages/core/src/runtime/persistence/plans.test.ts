import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { normalizeUpdateExpression } from '../../query/index.js'
import {
	acceptDatabasePersistenceRewrite,
	createDatabasePersistencePlan,
	rewriteDeletePersistencePlan,
} from './plans.js'

const articleSchema = Schema.define({
	className: 'PersistencePlanArticle',
	fields: (field) => ({ deleted: field.boolean(), title: field.string() }),
})
const deleteOperation = {
	kind: 'delete-one',
	query: new QueryBuilder(articleSchema).where((where) =>
		where.eq('id', 'article-1'),
	).ast,
} as const
const tombstone = normalizeUpdateExpression(articleSchema, { deleted: true })
const rewriterOwner = {
	contributionId: 'soft-delete',
	owner: { pluginId: 'fixture.soft-delete' },
	pluginVersion: '1.0.0',
} as const

describe('database persistence plans', () => {
	it('compiles one frozen canonical plan independently from logical intent', () => {
		const plan = createDatabasePersistencePlan(deleteOperation)

		expect(plan).toMatchObject({
			kind: 'delete-one',
			returning: { operationKind: 'delete-one' },
			target: { schema: deleteOperation.query.schema },
			version: 1,
		})
		expect(plan.data).toStrictEqual({ query: deleteOperation.query })
		expect(plan.provenance).toMatchObject([
			{ contributionId: 'canonical-persistence-plan' },
		])
		expect(Object.isFrozen(plan)).toBe(true)
		expect(Object.isFrozen(plan.data)).toBe(true)
		expect(Object.isFrozen(plan.returning)).toBe(true)
		expect(Object.isFrozen(plan.target)).toBe(true)
	})

	it('rewrites only physical delete data and appends Core-owned provenance', () => {
		const canonical = createDatabasePersistencePlan(deleteOperation)
		const candidate = rewriteDeletePersistencePlan(canonical, tombstone)
		const accepted = acceptDatabasePersistenceRewrite(
			deleteOperation,
			canonical,
			candidate,
			rewriterOwner,
		)

		expect(accepted).toMatchObject({
			kind: 'update-one',
			data: { query: deleteOperation.query, update: tombstone },
			returning: { operationKind: 'delete-one' },
		})
		expect(accepted.returning).toBe(canonical.returning)
		expect(accepted.target).toBe(canonical.target)
		expect(accepted.provenance).toMatchObject([
			{ contributionId: 'canonical-persistence-plan' },
			{
				contributionId: 'soft-delete',
				owner: { pluginId: 'fixture.soft-delete' },
			},
		])
		expect(deleteOperation.kind).toBe('delete-one')
	})

	it('rejects changed targets, result contracts, and same-kind data rewrites', () => {
		const canonical = createDatabasePersistencePlan(deleteOperation)
		const otherSchema = Schema.define({
			className: 'PersistencePlanOther',
			fields: (field) => ({ deleted: field.boolean() }),
		})

		expect(() =>
			acceptDatabasePersistenceRewrite(
				deleteOperation,
				canonical,
				{
					...canonical,
					target: { schema: new QueryBuilder(otherSchema).ast.schema },
				},
				rewriterOwner,
			),
		).toThrow('cannot change the logical target schema')
		expect(() =>
			acceptDatabasePersistenceRewrite(
				deleteOperation,
				canonical,
				{ ...canonical, returning: { ...canonical.returning } },
				rewriterOwner,
			),
		).toThrow('cannot change the logical result contract')
		expect(() =>
			acceptDatabasePersistenceRewrite(
				deleteOperation,
				canonical,
				{ ...canonical, data: { query: new QueryBuilder(articleSchema).ast } },
				rewriterOwner,
			),
		).toThrow('only permits delete plans to become update plans')
	})
})
