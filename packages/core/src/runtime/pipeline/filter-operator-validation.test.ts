import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { fieldPath, type FindManyOperationAst } from '../../query/index.js'
import { normalizeWhereInput } from '../../query/filters/where.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	databaseFilterOperatorCapabilityVersion,
	type DatabaseFilterOperatorCapability,
} from '../database/adapter-capabilities.js'
import type { DatabaseOperationExecutor } from '../database/contracts.js'
import { assertDatabaseFilterOperators } from './filter-operator-validation.js'
import { QueryBuilder } from '../../plugin.js'

const Article = UltimaBase.Schema.define({
	className: 'FilterOperatorArticle',
	fields: (field) => ({
		title: field.string(),
		views: field.int(),
		labels: field.string({ list: true }),
		metadata: field.json(),
	}),
})

/** An adapter executing a deliberate subset of the built-in operators. */
const subset: DatabaseFilterOperatorCapability = {
	kind: 'filter-operators',
	version: databaseFilterOperatorCapabilityVersion,
	families: {
		string: ['equal', 'null'],
		int: ['equal', 'greater-than'],
		json: ['equal'],
		list: ['list-has'],
		uuid: ['equal'],
	},
}

const executor = (
	filterOperators?: DatabaseFilterOperatorCapability,
): DatabaseOperationExecutor => ({
	...(filterOperators === undefined
		? {}
		: { capabilities: { filterOperators } }),
	execute: () => Promise.reject(new TypeError('never reached')),
})

const findMany = (
	query: QueryBuilder<typeof Article>,
): FindManyOperationAst<typeof Article> => ({
	kind: 'find-many',
	query: query.ast,
})

describe('adapter-declared filter operators (ADR-0301)', () => {
	let error: MockInstance<typeof console.error>

	beforeEach(() => {
		error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
	})

	afterEach(() => {
		error.mockRestore()
	})

	it('accepts every declared operator, including nested logic and paths', () => {
		expect(() => {
			assertDatabaseFilterOperators(executor(subset), {
				operation: findMany(
					new QueryBuilder(Article)
						.where((where) => where.eq('title', 'a').isNull('title'))
						.where({ OR: [{ views: { gt: 3 } }, { labels: { has: 'x' } }] })
						.where((where) => where.eq(fieldPath('metadata', ['a']), 1)),
				),
			})
		}).not.toThrow()
	})

	it.each([
		[
			'startsWith',
			'title',
			new QueryBuilder(Article).where({ title: { startsWith: 'a' } }),
		],
		[
			'isNotNull',
			'views',
			new QueryBuilder(Article).where({ views: { isNotNull: true } }),
		],
		[
			'hasSome',
			'labels',
			new QueryBuilder(Article).where({ labels: { hasSome: ['a'] } }),
		],
		[
			'contains',
			'metadata',
			new QueryBuilder(Article).where({ metadata: { contains: { a: 1 } } }),
		],
	] as const)(
		'rejects an undeclared caller operator %s with a public validation error',
		(operator, field, query) => {
			expect(() => {
				assertDatabaseFilterOperators(executor(subset), {
					operation: findMany(query),
				})
			}).toThrow(
				expect.objectContaining({
					code: 'VALIDATION_ERROR',
					publicDetails: { field, operator },
					publicMessage: `The filter operator ${operator} is not supported on field ${field}.`,
				}),
			)
		},
	)

	it('treats a missing declaration as supporting no operator', () => {
		expect(() => {
			assertDatabaseFilterOperators(executor(), {
				operation: findMany(
					new QueryBuilder(Article).where({ title: { eq: 'a' } }),
				),
			})
		}).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(() => {
			assertDatabaseFilterOperators(executor(), {
				operation: findMany(new QueryBuilder(Article)),
			})
		}).not.toThrow()
	})

	it('hides a protected filter behind a generic message and logs its details', () => {
		let thrown: unknown
		try {
			assertDatabaseFilterOperators(executor(subset), {
				operation: findMany(new QueryBuilder(Article)),
				rowFilter: normalizeWhereInput(Article, { title: { endsWith: 'x' } }),
			})
		} catch (caught: unknown) {
			thrown = caught
		}
		expect(thrown).toMatchObject({
			code: 'VALIDATION_ERROR',
			publicMessage: 'The request cannot be evaluated by the database.',
		})
		expect(thrown).not.toHaveProperty('publicDetails.field')
		expect(error).toHaveBeenCalledWith(
			'[UltimaBase] A protected filter uses an operator the database adapter does not declare',
			expect.objectContaining({ field: 'title', operator: 'endsWith' }),
		)
	})
})
