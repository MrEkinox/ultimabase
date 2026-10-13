import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import {
	queryFromFindManyInput,
	queryFromFindOneInput,
} from '../query/input.js'
import { QueryBuilder } from '../query/query.js'

// ADR-0309: a collection read has a total order and `after` becomes a filter.
const Owner = UltimaBase.Schema.define({
	className: 'PositionOwner',
	fields: (field) => ({ name: field.string() }),
})

const Task = UltimaBase.Schema.define({
	className: 'PositionTask',
	fields: (field) => ({
		owner: field.pointer({ target: 'PositionOwner' }),
		payload: field.json(),
		priority: field.enum({ values: ['high', 'low'], required: true }),
		rank: field.int(),
		tags: field.string({ list: true }),
		title: field.string({ required: true }),
	}),
})

new SchemaRegistry([Owner, Task]).resolveSchemaTargets()

const id = '0198f090-2a50-7000-8000-000000000001'

const positionError = (
	run: () => unknown,
): Readonly<{
	code: unknown
	publicDetails: unknown
	publicMessage: unknown
}> => {
	try {
		run()
	} catch (error: unknown) {
		if (!(error instanceof FrameworkError)) throw error
		const code: unknown = error.code
		const publicDetails: unknown = error.publicDetails
		const publicMessage: unknown = error.publicMessage
		return { code, publicDetails, publicMessage }
	}
	throw new Error('expected a position error')
}

describe('collection ordering', () => {
	it('completes every collection read with id ascending, once', () => {
		expect(queryFromFindManyInput(Task, {}).ast.ordering.orders).toStrictEqual([
			{ direction: 'ascending', field: 'id', kind: 'order' },
		])
		expect(
			queryFromFindManyInput(Task, { orderBy: { title: 'desc' } }).ast.ordering
				.orders,
		).toStrictEqual([
			{ direction: 'descending', field: 'title', kind: 'order' },
			{ direction: 'ascending', field: 'id', kind: 'order' },
		])
		expect(
			queryFromFindManyInput(Task, { orderBy: { id: 'desc', title: 'asc' } })
				.ast.ordering.orders,
		).toStrictEqual([
			{ direction: 'descending', field: 'id', kind: 'order' },
			{ direction: 'ascending', field: 'title', kind: 'order' },
		])
		// First-match reads keep their requested order.
		expect(queryFromFindOneInput(Task, {}).ast.ordering.orders).toStrictEqual(
			[],
		)
	})

	it('orders only non-list scalar and enum fields', () => {
		expect(() =>
			queryFromFindManyInput(Task, { orderBy: { priority: 'asc' } }),
		).not.toThrow()
		for (const field of ['owner', 'payload', 'tags']) {
			expect(() =>
				queryFromFindManyInput(Task, { orderBy: { [field]: 'asc' } } as never),
			).toThrow(
				new TypeError(
					'query.orders[0].field must name a non-list scalar or enum field',
				),
			)
			expect(() => new QueryBuilder(Task).ascending(field as never)).toThrow(
				TypeError,
			)
		}
	})
})

describe('after positions', () => {
	it('turns an ascending position into a strictly-after filter', () => {
		const query = queryFromFindManyInput(Task, {
			after: { id, title: 'b' },
			orderBy: { title: 'asc' },
			take: 2,
		})

		expect(query.ast.take).toBe(2)
		expect(query.ast.pagination).toBeUndefined()
		expect(query.ast.where?.expression).toStrictEqual({
			kind: 'or',
			expressions: [
				{ field: 'title', kind: 'greater-than', value: 'b' },
				{
					kind: 'and',
					expressions: [
						{ field: 'title', kind: 'equal', value: 'b' },
						{ field: 'id', kind: 'greater-than', value: id },
					],
				},
			],
		})
	})

	it('places null last in both directions and combines the caller where by AND', () => {
		const descending = queryFromFindManyInput(Task, {
			after: { id, rank: 3 },
			orderBy: { rank: 'desc' },
			where: { title: 'kept' },
		})

		expect(descending.ast.where?.expression).toStrictEqual({
			kind: 'and',
			expressions: [
				{ field: 'title', kind: 'equal', value: 'kept' },
				{
					kind: 'or',
					expressions: [
						{ field: 'rank', kind: 'less-than', value: 3 },
						{ field: 'rank', isNull: true, kind: 'null' },
						{
							kind: 'and',
							expressions: [
								{ field: 'rank', kind: 'equal', value: 3 },
								{ field: 'id', kind: 'greater-than', value: id },
							],
						},
					],
				},
			],
		})

		// Nothing follows a null except a later id among the nulls.
		expect(
			queryFromFindManyInput(Task, {
				after: { id, rank: null },
				orderBy: { rank: 'asc' },
			}).ast.where?.expression,
		).toStrictEqual({
			kind: 'and',
			expressions: [
				{ field: 'rank', isNull: true, kind: 'null' },
				{ field: 'id', kind: 'greater-than', value: id },
			],
		})
	})

	it('orders mixed directions with id as the last tie-breaker', () => {
		const query = queryFromFindManyInput(Task, {
			after: { id, priority: 'low', title: 'a', extra: 'ignored' },
			orderBy: { priority: 'desc', title: 'asc' },
		})

		expect(query.ast.where?.expression).toStrictEqual({
			kind: 'or',
			expressions: [
				{ field: 'priority', kind: 'less-than', value: 'low' },
				{
					kind: 'and',
					expressions: [
						{ field: 'priority', kind: 'equal', value: 'low' },
						{ field: 'title', kind: 'greater-than', value: 'a' },
					],
				},
				{
					kind: 'and',
					expressions: [
						{ field: 'priority', kind: 'equal', value: 'low' },
						{ field: 'title', kind: 'equal', value: 'a' },
						{ field: 'id', kind: 'greater-than', value: id },
					],
				},
			],
		})
	})

	it('names every missing ordered field with a public VALIDATION_ERROR', () => {
		const error = positionError(() =>
			queryFromFindManyInput(Task, {
				after: { id, title: 'a' },
				orderBy: { priority: 'asc', title: 'asc' },
			}),
		)

		expect(error).toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: { parameter: 'after' },
			publicMessage:
				'The after position is missing the ordered fields priority.',
		})

		expect(
			positionError(() =>
				queryFromFindManyInput(Task, {
					after: { id: undefined, title: 'a' } as never,
					orderBy: { priority: 'asc' },
				}),
			).publicMessage,
		).toBe('The after position is missing the ordered fields priority, id.')
	})

	it('validates every position value against its field', () => {
		for (const after of [
			{ id: 42, title: 'a' },
			{ id, title: null },
			{ id, title: 7 },
			'cursor',
			null,
		]) {
			expect(
				positionError(() =>
					queryFromFindManyInput(Task, {
						after: after as never,
						orderBy: { title: 'asc' },
					}),
				),
			).toMatchObject({
				code: 'VALIDATION_ERROR',
				publicDetails: { parameter: 'after' },
				publicMessage: 'The after position is invalid.',
			})
		}
	})

	it('validates the shape of every position value before the adapter', () => {
		// A string that is not a UUID would otherwise reach the database.
		for (const input of [
			{ after: { id: 'not-a-uuid' } },
			{ after: { id: 'not-a-uuid', title: 'a' }, orderBy: { title: 'asc' } },
		] as const) {
			expect(
				positionError(() => queryFromFindManyInput(Task, input)),
			).toMatchObject({
				code: 'VALIDATION_ERROR',
				publicDetails: { parameter: 'after' },
				publicMessage: 'The after position is invalid.',
			})
		}
	})

	it('refuses skip combined with after', () => {
		expect(
			positionError(() =>
				queryFromFindManyInput(Task, { after: { id }, skip: 1 }),
			),
		).toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: { parameter: 'after' },
			publicMessage: 'The after position cannot be combined with skip.',
		})
	})

	it('accepts after only on collection reads', () => {
		expect(() =>
			queryFromFindOneInput(Task, { after: { id } } as never),
		).toThrow('find-one input contains an unknown clause: after')
	})
})
