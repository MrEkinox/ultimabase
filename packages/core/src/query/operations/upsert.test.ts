import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../query/query.js'
import { increment } from '../updates/operators.js'
import {
	normalizeUniqueUpsertTarget,
	readUniqueUpsertTargetValues,
	normalizeUpsertInput,
} from './upsert.js'

const accountSchema = Schema.define({
	className: 'UpsertAccount',
	fields: (field) => ({
		email: field.string({ indexed: 'unique' }),
		tenantId: field.string(),
		handle: field.string(),
		visits: field.int({ default: 0 }),
	}),
	indexes: [{ fields: ['tenantId', 'handle'], unique: true }],
})

const foreignSchema = Schema.define({
	className: 'ForeignAccount',
	fields: (field) => ({ email: field.string({ indexed: 'unique' }) }),
})

const createInput = { email: 'dev@ultimabase.dev' }
const updateInput = { visits: increment(1) } as const

describe('unique upsert targets', () => {
	it('normalizes id, unique fields, and composite indexes in declaration order', () => {
		const id = new QueryBuilder(accountSchema).where((where) =>
			where.eq('id', 'account-1'),
		).ast
		const email = new QueryBuilder(accountSchema).where((where) =>
			where.eq('email', 'dev@ultimabase.dev'),
		).ast
		const composite = new QueryBuilder(accountSchema)
			.where((where) => where.eq('handle', 'dev'))
			.where((where) => where.eq('tenantId', 'tenant-1')).ast

		expect(normalizeUniqueUpsertTarget(accountSchema, id)).toStrictEqual({
			kind: 'unique-upsert-target',
			fields: ['id'],
		})
		expect(normalizeUniqueUpsertTarget(accountSchema, email)).toStrictEqual({
			kind: 'unique-upsert-target',
			fields: ['email'],
		})
		expect(normalizeUniqueUpsertTarget(accountSchema, composite)).toStrictEqual(
			{
				kind: 'unique-upsert-target',
				fields: ['tenantId', 'handle'],
			},
		)
		expect(
			Object.isFrozen(normalizeUniqueUpsertTarget(accountSchema, composite)),
		).toBe(true)
	})

	it('rejects filters that do not identify exactly one declared unique key', () => {
		const emailQuery = new QueryBuilder(accountSchema).where((where) =>
			where.eq('email', 'dev@ultimabase.dev'),
		).ast
		const nullTarget = {
			...emailQuery,
			where: {
				kind: 'where',
				expression: { kind: 'equal', field: 'email', value: null },
			},
		} as const
		const undefinedTarget = {
			...emailQuery,
			where: {
				kind: 'where',
				expression: { kind: 'equal', field: 'email', value: undefined },
			},
		} as const
		const disjunctionTarget = {
			...emailQuery,
			where: {
				kind: 'where',
				expression: {
					kind: 'or',
					expressions: [emailQuery.where?.expression],
				},
			},
		} as const
		const missingFilterNode = {
			...emailQuery,
			where: { kind: 'where', expression: null },
		} as const
		const malformedConjunction = {
			...emailQuery,
			where: {
				kind: 'where',
				expression: { kind: 'and', expressions: null },
			},
		} as const
		const cases = [
			new QueryBuilder(accountSchema).ast,
			new QueryBuilder(accountSchema).where((where) =>
				where.eq('handle', 'dev'),
			).ast,
			new QueryBuilder(accountSchema)
				.where((where) => where.eq('email', 'dev@ultimabase.dev'))
				.where((where) => where.eq('handle', 'dev')).ast,
			new QueryBuilder(accountSchema).where((where) =>
				where.ne('email', 'other@example.com'),
			).ast,
			nullTarget,
			undefinedTarget,
			disjunctionTarget,
			missingFilterNode,
			malformedConjunction,
		]

		for (const query of cases) {
			expect(() =>
				normalizeUniqueUpsertTarget(accountSchema, query as never),
			).toThrow(TypeError)
		}
	})

	it('rejects targeting clauses and schemas unrelated to conflict identity', () => {
		const ordered = new QueryBuilder(accountSchema)
			.where((where) => where.eq('email', 'dev@ultimabase.dev'))
			.ascending('email').ast
		const limited = new QueryBuilder(accountSchema)
			.where((where) => where.eq('email', 'dev@ultimabase.dev'))
			.limit(1).ast
		const paginated = new QueryBuilder(accountSchema)
			.where((where) => where.eq('email', 'dev@ultimabase.dev'))
			.offset(1).ast
		const foreign = new QueryBuilder(foreignSchema).where((where) =>
			where.eq('email', 'dev@ultimabase.dev'),
		).ast

		for (const query of [ordered, limited, paginated]) {
			expect(() => normalizeUniqueUpsertTarget(accountSchema, query)).toThrow(
				new TypeError('upsert target query cannot use ordering or pagination'),
			)
		}

		expect(() =>
			normalizeUniqueUpsertTarget(accountSchema, foreign as never),
		).toThrow(new TypeError('upsert query must reference the operation schema'))
	})

	it('recovers target values in declared unique-index order', () => {
		const query = new QueryBuilder(accountSchema)
			.where((where) => where.eq('handle', 'dev'))
			.where((where) => where.eq('tenantId', 'tenant-1')).ast
		const target = normalizeUniqueUpsertTarget(accountSchema, query)

		expect(readUniqueUpsertTargetValues(query, target)).toStrictEqual({
			handle: 'dev',
			tenantId: 'tenant-1',
		})
		expect(Object.isFrozen(readUniqueUpsertTargetValues(query, target))).toBe(
			true,
		)
		expect(() =>
			readUniqueUpsertTargetValues(query, {
				kind: 'unique-upsert-target',
				fields: ['handle'],
			}),
		).toThrow(
			new TypeError('upsert target query contains incompatible equalities'),
		)
	})
})

describe('bulk upsert items', () => {
	it('normalizes shared upsert values and rejects malformed wrappers', () => {
		expect(
			normalizeUpsertInput(accountSchema, {
				create: createInput,
				update: updateInput,
			}),
		).toStrictEqual({
			create: createInput,
			update: {
				kind: 'update-expression',
				operations: [{ kind: 'increment', field: 'visits', value: 1 }],
			},
		})
		expect(() => normalizeUpsertInput(accountSchema, null as never)).toThrow(
			new TypeError('upsert input must be an object'),
		)
		expect(() =>
			normalizeUpsertInput(accountSchema, {
				create: createInput,
				update: updateInput,
				extra: true,
			} as never),
		).toThrow(new TypeError('upsert input contains unknown key: extra'))
		expect(() =>
			normalizeUpsertInput(accountSchema, { update: updateInput } as never),
		).toThrow(new TypeError('upsert input must contain key: create'))
	})
})
