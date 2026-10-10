import {
	UltimaBase,
	isAuthenticated,
	type PolicyOperation,
	type PolicyPredicate,
	type Principal,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	accessPlugin,
	allOf,
	anyOf,
	not,
	type AccessDecisionRule,
	type FieldAccessInput,
	type SchemaItemAccessInput,
	type SchemaOperationAccessInput,
	type SchemaWhereAccessInput,
} from '../src/index.js'

// ADR-0304: every Access rule receives the Core policy context, so a
// PolicyPredicate is accepted wherever a rule returns a decision.
const App = UltimaBase.use(accessPlugin())
const isOwner: PolicyPredicate = function isOwner({ principal }) {
	return principal !== undefined
}

test('gives every rule input the principal, operation and schema', () => {
	expectTypeOf<SchemaOperationAccessInput['principal']>().toEqualTypeOf<
		Principal | undefined
	>()
	expectTypeOf<SchemaOperationAccessInput['operation']>().toEqualTypeOf<PolicyOperation>()
	expectTypeOf<SchemaOperationAccessInput['schema']>().toEqualTypeOf<string>()
	expectTypeOf<FieldAccessInput['principal']>().toEqualTypeOf<
		Principal | undefined
	>()
	type Document = typeof Document
	expectTypeOf<
		SchemaItemAccessInput<Document, 'update'>['principal']
	>().toEqualTypeOf<Principal | undefined>()
	expectTypeOf<SchemaWhereAccessInput<Document>['principal']>().toEqualTypeOf<
		Principal | undefined
	>()
	expectTypeOf(isAuthenticated).toEqualTypeOf<PolicyPredicate>()
	expectTypeOf(isOwner).toExtend<
		AccessDecisionRule<SchemaOperationAccessInput>
	>()
})

const Document = App.Schema.define({
	className: 'PolicyPredicateDocument',
	fields: (field) => ({ title: field.string() }),
}).with({
	access: {
		create: isAuthenticated,
		read: { allow: { many: isAuthenticated, one: isOwner } },
		update: { allow: anyOf(isAuthenticated, isOwner), item: isOwner },
		delete: allOf(isAuthenticated, not(isOwner)),
	},
})

test('rejects a rule that is not a decision', () => {
	App.Schema.define({
		className: 'PolicyPredicateInvalid',
		fields: (field) => ({ title: field.string() }),
	}).with({
		access: {
			// @ts-expect-error -- A predicate returns a boolean, not a filter.
			create: ({ principal }: { readonly principal: unknown }) => principal,
		},
	})
})
