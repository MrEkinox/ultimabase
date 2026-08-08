import { expectTypeOf, test } from 'vitest'

import {
	allMutations,
	allOf,
	allOperations,
	allowAll,
	anyOf,
	denyAll,
	not,
	type AllMutationAccess,
	type AllOperationAccess,
	type FieldReadAccessInput,
	type StringField,
} from '../index.js'
import type { AccessContext } from '../../access/index.js'
import type { AccessDecisionRule } from './contracts.js'

test('types literal and complete operation declaration utilities', () => {
	expectTypeOf(allowAll).toEqualTypeOf<true>()
	expectTypeOf(denyAll).toEqualTypeOf<false>()

	const operations = allOperations((input) => {
		const { context } = input

		expectTypeOf(context).toEqualTypeOf<AccessContext>()
		// @ts-expect-error -- Shared operation helpers expose no terminal kind.
		void input.kind

		return true
	})

	expectTypeOf(operations).toEqualTypeOf<AllOperationAccess>()

	const mutations = allMutations(({ context }) => {
		expectTypeOf(context).toEqualTypeOf<AccessContext>()

		return Promise.resolve(false)
	})

	expectTypeOf(mutations).toEqualTypeOf<AllMutationAccess>()
	// @ts-expect-error -- mutation declarations deliberately expose no read rule.
	void mutations.read
	// @ts-expect-error -- operation rules must return booleans.
	allOperations(() => 'allow')
})

test('contextually infers exact schema and field Access inputs', () => {
	interface UpdateInput {
		readonly context: AccessContext
		readonly kind: 'update-many' | 'update-one'
	}
	const updateRule: AccessDecisionRule<UpdateInput> = anyOf(
		({ kind }) => {
			expectTypeOf(kind).toEqualTypeOf<'update-many' | 'update-one'>()

			return kind === 'update-one'
		},
		async ({ context }) => Promise.resolve(context.access.mode === 'master'),
	)
	const strictUpdate = allOf<UpdateInput>(updateRule, true)
	const inverted = not<UpdateInput>(strictUpdate)
	type TextReadInput = FieldReadAccessInput<StringField>
	const fieldReadRule: AccessDecisionRule<TextReadInput> = anyOf(
		({ channel }) => {
			expectTypeOf(channel).toEqualTypeOf<'filter' | 'item' | 'order'>()

			return channel === 'item'
		},
		false,
	)

	expectTypeOf(updateRule).toEqualTypeOf<AccessDecisionRule<UpdateInput>>()
	expectTypeOf(inverted).toEqualTypeOf<AccessDecisionRule<UpdateInput>>()
	expectTypeOf(fieldReadRule).toEqualTypeOf<AccessDecisionRule<TextReadInput>>()

	// @ts-expect-error -- Access composition requires at least one decision.
	anyOf()
	// @ts-expect-error -- Access composition requires at least one decision.
	allOf()
	// @ts-expect-error -- Negation accepts exactly one decision.
	not(true, false)
})
