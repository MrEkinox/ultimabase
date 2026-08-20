import { expectTypeOf, test } from 'vitest'

import {
	RequestSubjectReference,
	RequestContextValue,
	Schema,
	requestPrincipalResolverCapability,
	requestRoleResolverCapability,
	createRequestPrincipalReference,
	parseRequestPrincipalReference,
	resolveRequestPrincipal,
	resolveRequestRoleReference,
	type RequestPrincipalResolver,
	type RequestPrincipalReference,
	type RequestPrincipalReferenceIdentity,
	type RequestRoleReference,
	type RequestRoleReferenceCarrier,
	type RequestRoleResolver,
	type RequestSubjectResolver,
	type RequestSubjectValue,
	type RequestSubjectValueOf,
	type ResolvedRequestSubject,
	type PointerValue,
	type CapabilityToken,
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
const editor = new RequestSubjectReference('role', 'editor')
const editorModel: RequestRoleReferenceCarrier = {
	toRequestRoleReference: () => editor,
}
const PrincipalSchema = Schema.define({
	className: 'TypedAccessPrincipal',
	fields: () => ({}),
})
const principalPointer = PrincipalSchema.pointer('principal-id')
const principalResolver: RequestPrincipalResolver<typeof principalPointer> = {
	resolveCurrent: () => principalPointer,
}

const resolver: RequestSubjectResolver<typeof editor, FixtureRole> = {
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
	expectTypeOf(principal).toExtend<RequestSubjectValue<FixturePrincipal>>()
	expectTypeOf<
		RequestSubjectValueOf<typeof principal>
	>().toEqualTypeOf<FixturePrincipal>()
	expectTypeOf(editor).toEqualTypeOf<
		RequestSubjectReference<'role', 'editor'>
	>()
	expectTypeOf(editor).toExtend<RequestRoleReference<'editor'>>()
	expectTypeOf(
		resolveRequestRoleReference(editorModel),
	).toEqualTypeOf<RequestRoleReference>()
	expectTypeOf<
		ResolvedRequestSubject<typeof resolver>
	>().toEqualTypeOf<FixtureRole>()
	expectTypeOf(requestRoleResolverCapability).toEqualTypeOf<
		CapabilityToken<
			RequestRoleResolver,
			RequestRoleResolver,
			'ultimabase.request-subject.role-resolver',
			'1.0.0',
			'single',
			'application'
		>
	>()
	expectTypeOf(requestPrincipalResolverCapability).toEqualTypeOf<
		CapabilityToken<
			RequestPrincipalResolver,
			RequestPrincipalResolver,
			'ultimabase.request-subject.principal-resolver',
			'1.0.0',
			'single',
			'application'
		>
	>()
	expectTypeOf<RequestPrincipalResolver['resolveCurrent']>().toBeFunction()
	expectTypeOf(
		createRequestPrincipalReference(principalPointer),
	).toEqualTypeOf<RequestPrincipalReference>()
	expectTypeOf(
		parseRequestPrincipalReference(
			createRequestPrincipalReference(principalPointer),
		),
	).toEqualTypeOf<Readonly<RequestPrincipalReferenceIdentity>>()
	expectTypeOf<
		NonNullable<RequestRoleResolver['resolvePersistentRole']>
	>().toBeFunction()
	expectTypeOf(
		resolveRequestPrincipal({
			context: {} as never,
			ownsSchema: () => true,
			resolver: principalResolver,
		}),
	).toEqualTypeOf<Promise<PointerValue | undefined>>()

	// @ts-expect-error -- Core never introduces a native authenticated authority mode.
	const invalidMode: 'user' = 'anonymous'
	void invalidMode

	const invalidResolver: RequestPrincipalResolver = {
		// @ts-expect-error -- Principal providers must return exact Core Pointers.
		resolveCurrent: () => ({ id: 'principal-id' }),
	}
	void invalidResolver
})

test('keeps nominal subject references distinct from structural values', () => {
	// @ts-expect-error -- Plain records cannot forge nominal Access references.
	const forged: RequestRoleReference<'editor'> = {
		kind: 'role',
		value: 'editor',
	}
	void forged
})
