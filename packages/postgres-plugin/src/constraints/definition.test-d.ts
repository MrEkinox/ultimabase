import type { DatabaseConstraintPayload } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	postgresConstraintCompiler,
	type PostgresConstraintCompilerDefinition,
} from './definition.js'

test('preserves exact kind, version, and decoded payload types', () => {
	const definition = postgresConstraintCompiler({
		kind: 'fixture.tenant',
		version: 2,
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
		compile: ({ anyOf, field, payload, sql }) => {
			expectTypeOf(payload).toEqualTypeOf<{
				readonly tenantId: string
			}>()

			return anyOf(sql`${field('tenantId')} = ${payload.tenantId}`)
		},
	})

	expectTypeOf(definition).toEqualTypeOf<
		PostgresConstraintCompilerDefinition<
			'fixture.tenant',
			2,
			{ readonly tenantId: string }
		>
	>()
})

test('rejects structural predicate lookalikes', () => {
	postgresConstraintCompiler({
		kind: 'fixture.invalid-predicate',
		version: 1,
		decode: (payload) => payload,
		// @ts-expect-error -- Only the provided SQL tag can create a predicate.
		compile: () => ({}),
	})
})
