import { expectTypeOf, test } from 'vitest'

import {
	RequestSubjectReference,
	requestPrincipalResolverCapability,
	createRequestPrincipalReference,
	parseRequestPrincipalReference,
	getRequestPrincipal,
	type RequestPrincipalResolver,
	type RequestPrincipalReference,
	type RequestPrincipalReferenceIdentity,
	type RequestSubjectResolver,
	type RequestSubjectValue,
	type RequestSubjectValueOf,
	type ResolvedRequestSubject,
	type Principal,
} from '../../index.js'
import type { CapabilityToken } from '../../plugin.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { RequestContextValue } from '../../plugin.js'

interface FixturePrincipal {
	readonly id: string
	readonly organizationId: string
}

interface FixtureGroup {
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
const editor = new RequestSubjectReference('group', 'editor')
const PrincipalSchema = UltimaBase.Schema.define({
	className: 'TypedAccessPrincipal',
	fields: () => ({}),
})
const principalPointer = PrincipalSchema.pointer('principal-id')
const principalResolver: RequestPrincipalResolver<typeof principalPointer> = {
	resolveCurrent: () => principalPointer,
}
void principalResolver

const resolver: RequestSubjectResolver<typeof editor, FixtureGroup> = {
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
		RequestSubjectReference<'group', 'editor'>
	>()
	expectTypeOf<
		ResolvedRequestSubject<typeof resolver>
	>().toEqualTypeOf<FixtureGroup>()
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
	expectTypeOf(getRequestPrincipal).returns.toEqualTypeOf<
		Promise<Principal | undefined>
	>()

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
	const forged: RequestSubjectReference<'group', 'editor'> = {
		kind: 'group',
		value: 'editor',
	}
	void forged
})
