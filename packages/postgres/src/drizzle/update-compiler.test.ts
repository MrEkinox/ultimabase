import { Pointer, normalizeUpdateExpression } from '@ultimabase/core'
import { decimalField, Schema, intField, stringField } from '@ultimabase/core'
import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { createPostgresPointerFixture } from '../schema/pointer-fixture.test-support.js'
import { compilePostgresUpdate } from './update-compiler.js'

const updateSchemaDefinition = Schema.define({
	className: 'UpdateFixture',
	fields: {
		balance: decimalField(),
		note: stringField(),
		title: stringField(),
		views: intField(),
	},
})
const updateSchema = compilePostgresSchema(updateSchemaDefinition)
const dialect = new PgDialect()

describe('PostgreSQL update compiler', () => {
	it('encodes pointer replacements through the shared UUID codec', () => {
		const { catalog, Post, User } = createPostgresPointerFixture()
		const pointer = new Pointer(User, '018f0f8c-7b5a-7cc9-98db-123456789abc')
		const compiled = compilePostgresUpdate(catalog.get(Post), {
			kind: 'update-expression',
			operations: [{ field: 'author', kind: 'set', value: pointer }],
		})

		expect(compiled).toStrictEqual({ author: pointer.id })
	})

	it('compiles replacements, absence, and numeric expressions once per field', () => {
		const update = normalizeUpdateExpression(updateSchemaDefinition, {
			set: { title: 'Updated' },
			unset: ['note'],
			increment: { views: 2 },
			decrement: { balance: '1.25' },
		})
		const compiled = compilePostgresUpdate(updateSchema, update)
		const increment = compiled.views
		const decrement = compiled.balance

		if (!(increment instanceof SQL) || !(decrement instanceof SQL)) {
			throw new TypeError('Numeric update fixture requires SQL expressions')
		}

		expect(compiled.title).toBe('Updated')
		expect(compiled.note).toBeNull()
		expect(dialect.sqlToQuery(increment)).toMatchObject({
			params: [2],
			sql: '"update_fixtures"."views" + $1',
		})
		expect(dialect.sqlToQuery(decrement)).toMatchObject({
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
})
