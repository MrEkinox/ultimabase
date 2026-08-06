import { expectTypeOf, test } from 'vitest'

import type { CreateOneOperationAst } from '../../query/index.js'
import { Schema, booleanField, stringField } from '../../schema/index.js'
import type { DatabaseConstraintNode } from '../database/contracts.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import type { EnforcementOperation } from './contracts.js'
import {
	constraint,
	databaseConstraint,
	guard,
	restrictInput,
	restrictOutput,
	restrictSelection,
} from './definitions.js'

const postSchema = Schema.define({
	className: 'EnforcementTypePost',
	fields: {
		published: booleanField(),
		title: stringField(),
	},
})

test('preserves exact schemas, operation kinds, constraints, and results', () => {
	guard({
		schema: postSchema,
		operations: ['create-one'],
		handler: ({ operation }) => {
			expectTypeOf(operation).toEqualTypeOf<
				CreateOneOperationAst<typeof postSchema>
			>()
		},
	})

	constraint({
		master: 'bypass',
		schema: postSchema,
		operations: ['find-many'],
		handler: ({ operation }) => {
			expectTypeOf(operation).toEqualTypeOf<
				EnforcementOperation<typeof postSchema, 'find-many'>
			>()

			return databaseConstraint('fixture.tenant', 1, { tenantId: 'tenant-1' })
		},
	})

	constraint({
		handler: () => databaseConstraint('fixture.master', 1, {}),
		// @ts-expect-error -- Master behavior is a closed explicit policy.
		master: 'skip',
	})

	restrictOutput({
		schema: postSchema,
		operations: ['find-many'],
		handler: ({ operation, result }) => {
			type FindOperation = EnforcementOperation<typeof postSchema, 'find-many'>

			expectTypeOf(operation).toEqualTypeOf<FindOperation>()
			expectTypeOf(result).toEqualTypeOf<
				RuntimeOperationResult<FindOperation>
			>()

			return ['id', 'title']
		},
	})
})

test('rejects grants, invalid fields, and non-namespaced constraint kinds', () => {
	guard({
		schema: postSchema,
		// @ts-expect-error -- A guard cannot return a grant-shaped effect.
		handler: () => ({ granted: true }),
	})

	restrictInput({
		schema: postSchema,
		// @ts-expect-error -- Restrictions accept only exact schema field names.
		handler: () => ['missing'] as const,
	})

	restrictSelection({
		schema: postSchema,
		handler: () => ['id', 'published'],
	})

	const node = databaseConstraint('fixture.tenant', 1, { tenantId: 'tenant-1' })
	expectTypeOf(node).toEqualTypeOf<
		DatabaseConstraintNode<
			'fixture.tenant',
			1,
			{ readonly tenantId: 'tenant-1' }
		>
	>()
})
