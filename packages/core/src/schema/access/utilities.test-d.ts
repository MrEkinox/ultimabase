import { expectTypeOf, test } from 'vitest'

import {
	allMutations,
	allOperations,
	allowAll,
	denyAll,
	type AllMutationAccess,
	type AllOperationAccess,
} from '../index.js'
import type { AccessContext } from '../../access/index.js'

test('types literal and complete operation declaration utilities', () => {
	expectTypeOf(allowAll).toEqualTypeOf<true>()
	expectTypeOf(denyAll).toEqualTypeOf<false>()

	const operations = allOperations(({ context, kind }) => {
		expectTypeOf(context).toEqualTypeOf<AccessContext>()
		expectTypeOf(kind).toEqualTypeOf<
			| 'count'
			| 'create-many'
			| 'create-one'
			| 'delete-many'
			| 'delete-one'
			| 'exists'
			| 'find'
			| 'first'
			| 'get'
			| 'update-many'
			| 'update-one'
			| 'upsert-many'
			| 'upsert-one'
		>()

		return true
	})

	expectTypeOf(operations).toEqualTypeOf<AllOperationAccess>()

	const mutations = allMutations(({ kind }) => {
		expectTypeOf(kind).toEqualTypeOf<
			| 'create-many'
			| 'create-one'
			| 'delete-many'
			| 'delete-one'
			| 'update-many'
			| 'update-one'
			| 'upsert-many'
			| 'upsert-one'
		>()

		return Promise.resolve(false)
	})

	expectTypeOf(mutations).toEqualTypeOf<AllMutationAccess>()
	// @ts-expect-error -- mutation declarations deliberately expose no read rule.
	void mutations.read
	// @ts-expect-error -- operation rules must return booleans.
	allOperations(() => 'allow')
})
