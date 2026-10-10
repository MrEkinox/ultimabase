import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	isAuthenticated,
	type CanOptions,
	type PointerValue,
	type PolicyContext,
	type PolicyPredicate,
	type Principal,
} from '../../index.js'

const Member = UltimaBase.Schema.define({
	className: 'PrincipalTypeMember',
	fields: (field) => ({ name: field.string() }),
})

test('types an unregistered principal as any pointer (ADR-0304)', () => {
	expectTypeOf<Principal>().toEqualTypeOf<PointerValue>()
	expectTypeOf(Member.pointer('id')).toExtend<Principal>()
	expectTypeOf<PolicyContext['principal']>().toEqualTypeOf<
		Principal | undefined
	>()
	expectTypeOf(isAuthenticated).toEqualTypeOf<PolicyPredicate>()
	expectTypeOf<ReturnType<PolicyPredicate>>().toEqualTypeOf<
		boolean | Promise<boolean>
	>()
})

test('keeps can() options explicit (ADR-0305)', () => {
	expectTypeOf<CanOptions['principal']>().toEqualTypeOf<
		PointerValue | undefined
	>()
	const options: CanOptions<typeof Member> = {
		operation: 'update',
		schema: Member,
		item: { id: 'member-id' },
	}
	void options
	const invalid: CanOptions = {
		operation: 'read',
		schema: Member,
		// @ts-expect-error -- `can()` answers one question at a time.
		select: { id: true },
	}
	void invalid
})
