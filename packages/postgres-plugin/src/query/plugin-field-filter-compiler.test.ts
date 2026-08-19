import { definePluginField, QueryBuilder, Schema } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
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

const PortableFilterSchema = Schema.define({
	className: 'PostgresPortableFilterFixture',
	fields: () => ({
		code: definePluginField(
			'fixture.postgres.portable-code',
			{ validation: { required: true } },
			{
				snapshotValue: snapshotPortableCode,
				storageCodec: {
					decode: (value) => snapshotPortableCode({ code: value }, 'stored code'),
					encode: (value) => value.code,
					format: 'json',
					version: 1,
				},
			},
		),
	}),
})

describe('PostgreSQL portable plugin field filters', () => {
	it('encodes equality operands through the field codec', () => {
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

		const rendered = new PgDialect().sqlToQuery(
			compilePostgresFilter(
				expression,
				compilePostgresSchema(PortableFilterSchema),
			),
		)

		expect(rendered.params).toContain('stable')
		expect(rendered.params).toContain('legacy')
	})
})
