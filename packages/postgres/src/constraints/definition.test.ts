import { isPlainRecord } from '@ultimabase/shared'
import { sql as drizzleSql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
	compilePostgresConstraintPredicate,
	postgresConstraintCompiler,
} from './definition.js'
import { Schema, stringField } from '@ultimabase/core'
import { compilePostgresSchema } from '../schema/schema-compiler.js'

const schema = compilePostgresSchema(
	new Schema({
		className: 'ConstraintArticle',
		fields: { tenantId: stringField() },
	}),
)
const dialect = new PgDialect()

const decodeTenant = (payload: unknown): { readonly tenantId: string } => {
	if (!isPlainRecord(payload) || typeof payload.tenantId !== 'string') {
		throw new TypeError('tenant constraint payload is invalid')
	}

	return { tenantId: payload.tenantId }
}

describe('postgresConstraintCompiler', () => {
	it('retains metadata while compiling fields and values into opaque SQL', () => {
		const definition = postgresConstraintCompiler({
			kind: 'fixture.tenant',
			version: 1,
			decode: decodeTenant,
			compile: ({ field, payload, sql }) =>
				sql`${field('tenantId')} = ${payload.tenantId}`,
		})
		const expression = compilePostgresConstraintPredicate(definition, schema, {
			tenantId: 'tenant-1',
		})

		expect(definition).toStrictEqual({
			adapter: 'postgres',
			kind: 'fixture.tenant',
			version: 1,
		})
		expect(Object.isFrozen(definition)).toBe(true)
		expect(dialect.sqlToQuery(expression)).toMatchObject({
			params: ['tenant-1'],
			sql: '"constraint_articles"."tenantId" = $1',
		})
	})

	it('rejects SQL-wrapper interpolations before Drizzle can unwrap them', () => {
		const injectedSql = drizzleSql.raw('true; drop table secrets')
		const definition = postgresConstraintCompiler({
			kind: 'fixture.safe-parameter',
			version: 1,
			decode: (payload) => payload,
			// Runtime validation still protects JavaScript callers bypassing TypeScript.
			compile: ({ sql }) => sql`true = ${injectedSql as never}`,
		})
		expect(() =>
			compilePostgresConstraintPredicate(definition, schema, null),
		).toThrow(
			'postgres constraint interpolation[0] must be a portable scalar, array, or plain-object value',
		)
	})

	it('rejects invalid payloads, fields, outputs, and JavaScript options', () => {
		const invalidPayload = postgresConstraintCompiler({
			kind: 'fixture.payload',
			version: 1,
			decode: decodeTenant,
			compile: ({ sql }) => sql`true`,
		})
		const invalidField = postgresConstraintCompiler({
			kind: 'fixture.field',
			version: 1,
			decode: (payload) => payload,
			compile: ({ field, sql }) => sql`${field('missing')} is null`,
		})
		const invalidOutput = postgresConstraintCompiler({
			kind: 'fixture.output',
			version: 1,
			decode: (payload) => payload,
			compile: () => ({}) as never,
		})

		expect(() =>
			compilePostgresConstraintPredicate(invalidPayload, schema, null),
		).toThrow('tenant constraint payload is invalid')
		expect(() =>
			compilePostgresConstraintPredicate(invalidField, schema, null),
		).toThrow('PostgreSQL query references missing field: missing')
		expect(() =>
			compilePostgresConstraintPredicate(invalidOutput, schema, null),
		).toThrow('PostgreSQL constraint compiler returned an invalid predicate')
		expect(() => postgresConstraintCompiler(null as never)).toThrow(
			'postgres constraint compiler options must be a plain object',
		)
		expect(() =>
			postgresConstraintCompiler({
				kind: 'fixture.invalid',
				version: 1,
				decode: true,
				compile: () => undefined,
			} as never),
		).toThrow('postgres constraint compiler decode must be a function')
	})
})
