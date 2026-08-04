import { expectTypeOf, test } from 'vitest'

import {
	AccessSubjectReference,
	RequestContextValue,
	Schema,
	accessPrincipalResolverServiceToken,
	accessRoleResolverServiceToken,
	resolveAccessPrincipal,
	resolveAccessRoleReference,
	type AccessPrincipalResolver,
	type AccessRoleReference,
	type AccessRoleReferenceCarrier,
	type AccessRoleResolver,
	type AccessSubjectResolver,
	type AccessSubjectValue,
	type InferAccessSubjectValue,
	type InferResolvedAccessSubject,
	type PointerValue,
	type ServiceToken,
} from '../../index.js'

interface FixturePrincipal {
	readonly id: string
	readonly organizationId: string
}

interface FixtureRole {
	readonly key: string
	readonly inherited: readonly string[]
}

const principal = new RequestContextValue<FixturePrincipal>(
	'fixture.principal',
	(value: unknown): FixturePrincipal => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string' ||
			!('organizationId' in value) ||
			typeof value.organizationId !== 'string'
		) {
			throw new TypeError('Invalid fixture principal')
		}

		return Object.freeze({
			id: value.id,
			organizationId: value.organizationId,
		})
	},
)
const editor = new AccessSubjectReference('role', 'editor')
const editorModel: AccessRoleReferenceCarrier = {
	toAccessRoleReference: () => editor,
}
const PrincipalSchema = Schema.define({
	className: 'TypedAccessPrincipal',
	fields: {},
})
const principalPointer = PrincipalSchema.pointer('principal-id')
const principalResolver: AccessPrincipalResolver<typeof principalPointer> = {
	resolveCurrent: () => principalPointer,
}

const resolver: AccessSubjectResolver<typeof editor, FixtureRole> = {
	resolve: ({ context, reference }) => {
		expectTypeOf(context.getValue(principal)).toEqualTypeOf<
			FixturePrincipal | undefined
		>()
		expectTypeOf(reference).toEqualTypeOf<typeof editor>()

		return {
			key: reference.value,
			inherited: [],
		}
	},
}

test('infers plugin-owned principals and resolved subjects exactly', () => {
	void resolver
	expectTypeOf(principal).toExtend<AccessSubjectValue<FixturePrincipal>>()
	expectTypeOf<
		InferAccessSubjectValue<typeof principal>
	>().toEqualTypeOf<FixturePrincipal>()
	expectTypeOf(editor).toEqualTypeOf<AccessSubjectReference<'role', 'editor'>>()
	expectTypeOf(editor).toExtend<AccessRoleReference<'editor'>>()
	expectTypeOf(
		resolveAccessRoleReference(editorModel),
	).toEqualTypeOf<AccessRoleReference>()
	expectTypeOf<
		InferResolvedAccessSubject<typeof resolver>
	>().toEqualTypeOf<FixtureRole>()
	expectTypeOf(accessRoleResolverServiceToken).toEqualTypeOf<
		ServiceToken<AccessRoleResolver>
	>()
	expectTypeOf(accessPrincipalResolverServiceToken).toEqualTypeOf<
		ServiceToken<AccessPrincipalResolver>
	>()
	expectTypeOf(principalResolver.resolveCurrent).toBeFunction()
	expectTypeOf(
		resolveAccessPrincipal({
			context: {} as never,
			ownsSchema: () => true,
			resolver: principalResolver,
		}),
	).toEqualTypeOf<Promise<PointerValue | undefined>>()

	// @ts-expect-error -- Core never introduces a native authenticated authority mode.
	const invalidMode: 'user' = 'anonymous'
	void invalidMode

	const invalidResolver: AccessPrincipalResolver = {
		// @ts-expect-error -- Principal providers must return exact Core Pointers.
		resolveCurrent: () => ({ id: 'principal-id' }),
	}
	void invalidResolver
})

test('keeps nominal subject references distinct from structural values', () => {
	// @ts-expect-error -- Plain records cannot forge nominal Access references.
	const forged: AccessRoleReference<'editor'> = {
		kind: 'role',
		value: 'editor',
	}
	void forged
})
