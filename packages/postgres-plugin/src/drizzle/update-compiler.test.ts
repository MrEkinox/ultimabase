import {
	Pointer,
	decrement,
	increment,
	normalizeUpdateExpression,
} from '@ultimabase/core'
import { UltimaBase } from '@ultimabase/core'
import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.test-support.js'
import { createPostgresPointerFixture } from '../schema/pointer-fixture.test-support.js'
import { compilePostgresUpdate } from './update-compiler.js'

const updateSchemaDefinition = UltimaBase.Schema.define({
	className: 'UpdateFixture',
	fields: (field) => ({
		balance: field.decimal(),
		note: field.string(),
		title: field.string(),
		views: field.int(),
	}),
})
const updateSchema = compilePostgresSchema(updateSchemaDefinition)
const dialect = new PgDialect()

describe('PostgreSQL update compiler', () => {
	it('leaves pointer replacements logical for Drizzle column mapping', () => {
		const { catalog, Post, User } = createPostgresPointerFixture()
		const pointer = new Pointer(User, '018f0f8c-7b5a-7cc9-98db-123456789abc')
		const compiled = compilePostgresUpdate(catalog.get(Post), {
			kind: 'update-expression',
			operations: [{ field: 'author', kind: 'set', value: pointer }],
		})

		expect(compiled).toStrictEqual({ author: pointer })
	})

	it('compiles replacements, absence, and numeric expressions once per field', () => {
		const update = normalizeUpdateExpression(updateSchemaDefinition, {
			note: null,
			title: 'Updated',
			views: increment(2),
			balance: decrement('1.25'),
		})
		const compiled = compilePostgresUpdate(updateSchema, update)
		const incrementSql = compiled.views
		const decrementSql = compiled.balance

		if (!(incrementSql instanceof SQL) || !(decrementSql instanceof SQL)) {
			throw new TypeError('Numeric update fixture requires SQL expressions')
		}

		expect(compiled.title).toBe('Updated')
		expect(compiled.note).toBeNull()
		expect(dialect.sqlToQuery(incrementSql)).toMatchObject({
			params: [2],
			sql: '"update_fixtures"."views" + $1',
		})
		expect(dialect.sqlToQuery(decrementSql)).toMatchObject({
			params: ['1.25'],
			sql: '"update_fixtures"."balance" - $1',
		})
		expect(Object.isFrozen(compiled)).toBe(true)
	})

	it('rejects malformed or duplicate operations at the adapter boundary', () => {
		expect(() => compilePostgresUpdate(updateSchema, {})).toThrow(
			new TypeError('PostgreSQL update expression is invalid'),
		)
		expect(() =>
			compilePostgresUpdate(updateSchema, {
				kind: 'update-expression',
				operations: [
					{ field: 'title', kind: 'set', value: 'one' },
					{ field: 'title', kind: 'set', value: 'two' },
				],
			}),
		).toThrow(new TypeError('PostgreSQL update operation is invalid'))
	})

	it('leaves logical relation deltas to the dedicated storage executor', () => {
		expect(
			compilePostgresUpdate(updateSchema, {
				kind: 'update-expression',
				operations: [
					{
						field: 'tags',
						kind: 'relation',
						value: { action: 'clear', targets: [] },
					},
				],
			}),
		).toStrictEqual({})
	})
})
