import {
	definePluginField,
	fieldPath,
	QueryBuilder,
	UltimaBase,
	type QueryFilterNode,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.test-support.js'
import { compilePostgresFilter } from './filter-compiler.js'

const snapshotPortableCode = (
	value: unknown,
	path: string,
): Readonly<{ code: string }> => {
	if (!isPlainRecord(value) || typeof value.code !== 'string') {
		throw new TypeError(`${path} must contain a string code`)
	}

	return immutableRecord({ code: value.code })
}

const snapshotPortableCodeFragment = (
	value: unknown,
	path: string,
): Readonly<{ code: string }> => snapshotPortableCode(value, path)

let completeValueEncodeCalls = 0

const PortableFilterSchema = UltimaBase.Schema.define({
	className: 'PostgresPortableFilterFixture',
	fields: (field) => ({
		code: definePluginField(
			'fixture.postgres.portable-code',
			{ required: true },
			{
				snapshotValue: snapshotPortableCode,
				storageCodec: {
					decode: (value) => {
						if (
							!isPlainRecord(value) ||
							value.version !== 1 ||
							typeof value.complete !== 'string'
						) {
							throw new TypeError('stored code must be a complete value')
						}

						return snapshotPortableCode({ code: value.complete }, 'stored code')
					},
					encode: (value) => {
						completeValueEncodeCalls += 1
						return { complete: value.code, version: 1 }
					},
					format: 'json',
					version: 1,
				},
				structuralContains: {
					snapshotOperand: (
						value: unknown,
						path: string,
					): Readonly<{ partial: string }> =>
						immutableRecord({
							partial: snapshotPortableCodeFragment(value, path).code,
						}),
				},
			},
		),
		nested: field.object({
			fields: () => ({
				code: definePluginField(
					'fixture.postgres.nested-portable-code',
					{},
					{
						snapshotValue: snapshotPortableCode,
						storageCodec: {
							decode: (value) =>
								snapshotPortableCode(value, 'stored nested code'),
							encode: (value) => value,
							format: 'json',
							version: 1,
						},
						structuralContains: {
							snapshotOperand: snapshotPortableCodeFragment,
						},
					},
				),
			}),
		}),
	}),
})

const dialect = new PgDialect()

const renderQuery = (query: QueryBuilder<typeof PortableFilterSchema>) => {
	const expression = query.ast.where?.expression

	if (expression === undefined) {
		throw new TypeError('Portable filter fixture requires an expression')
	}

	return dialect.sqlToQuery(
		compilePostgresFilter(
			expression,
			compilePostgresSchema(PortableFilterSchema),
		),
	)
}

describe('PostgreSQL portable plugin field filters', () => {
	it('encodes equality operands through the field codec', () => {
		completeValueEncodeCalls = 0
		const query = new QueryBuilder(PortableFilterSchema).where({
			code: {
				eq: { code: 'stable' },
				notIn: [{ code: 'legacy' }],
			},
		})
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Portable filter fixture requires an expression')
		}

		const rendered = dialect.sqlToQuery(
			compilePostgresFilter(
				expression,
				compilePostgresSchema(PortableFilterSchema),
			),
		)

		expect(rendered.params).toContainEqual({ complete: 'stable', version: 1 })
		expect(rendered.params).toContainEqual({ complete: 'legacy', version: 1 })
		expect(completeValueEncodeCalls).toBe(2)
	})

	it('compiles root and nested partial operands through parameterized JSONB containment', () => {
		completeValueEncodeCalls = 0
		const logical = renderQuery(
			new QueryBuilder(PortableFilterSchema).where({
				AND: [{ code: { contains: { code: 'root' } } }],
				OR: [
					{ code: { contains: { code: 'alternative' } } },
					{ code: { contains: { code: 'fallback' } } },
				],
			}),
		)
		const nested = renderQuery(
			new QueryBuilder(PortableFilterSchema).where((where) =>
				where.contains(fieldPath('nested', ['code']), { code: 'nested' }),
			),
		)

		expect(logical.sql.match(/ @> /gu)).toHaveLength(3)
		expect(logical.sql).toMatch(/\(.* and \(.* or .*\)\)/u)
		expect(nested.sql).toContain(' #> ')
		expect([...logical.params, ...nested.params]).toEqual(
			expect.arrayContaining([
				'{"partial":"root"}',
				'{"partial":"alternative"}',
				'{"partial":"fallback"}',
				'{"code":"nested"}',
			]),
		)
		expect(completeValueEncodeCalls).toBe(0)
	})

	it('fails closed for mismatched plans and malformed forged operands', () => {
		const compiled = compilePostgresSchema(PortableFilterSchema)
		const code = compiled.fields.code
		const nested = compiled.fields.nested

		if (code === undefined || nested === undefined) {
			throw new TypeError('Portable compiled fields are unavailable')
		}

		const query = new QueryBuilder(PortableFilterSchema).where({
			code: { contains: { code: 'stable' } },
		})
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Portable containment expression is unavailable')
		}

		expect(() =>
			compilePostgresFilter(expression, {
				...compiled,
				fields: { ...compiled.fields, code: { ...code, storage: 'text' } },
			}),
		).toThrow('requires a matching JSONB field plan and codec')

		expect(() =>
			compilePostgresFilter(expression, {
				...compiled,
				fields: { ...compiled.fields, code: { ...code, plan: nested.plan } },
			}),
		).toThrow('compiled field plan does not match schema field')

		const forged = {
			field: 'code',
			kind: 'contains',
			value: { partial: Number.NaN },
		} as unknown as QueryFilterNode<typeof PortableFilterSchema>

		expect(() => compilePostgresFilter(forged, compiled)).toThrow(
			'must contain finite numbers',
		)
	})
})
