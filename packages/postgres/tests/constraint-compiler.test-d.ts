import type { DatabaseConstraintPayload } from '@ultimabase/core'
import {
	postgresConstraintCompiler,
	type PostgresConstraintCompilerDefinition,
} from '@ultimabase/postgres'
import { expectTypeOf, test } from 'vitest'

test('publishes exact compiler payload inference without exposing Drizzle', () => {
	const definition = postgresConstraintCompiler({
		kind: 'fixture.packed-tenant',
		version: 1,
		decode: (
			payload: DatabaseConstraintPayload,
		): { readonly tenantId: string } => {
			if (
				typeof payload !== 'object' ||
				payload === null ||
				!('tenantId' in payload) ||
				typeof payload.tenantId !== 'string'
			) {
				throw new TypeError('invalid tenant payload')
			}

			return { tenantId: payload.tenantId }
		},
		compile: ({ field, payload, sql }) =>
			sql`${field('tenantId')} = ${payload.tenantId}`,
	})

	expectTypeOf(definition).toEqualTypeOf<
		PostgresConstraintCompilerDefinition<
			'fixture.packed-tenant',
			1,
			{ readonly tenantId: string }
		>
	>()
})
