import { expectTypeOf, test } from 'vitest'

import {
	HttpApplicationMountTable,
	httpApplicationProtocolVersion,
	httpMount,
	httpOriginalHeaderMode,
	httpPlugin,
	httpRoute,
	provideHttpEndpoints,
	type HttpEndpointDefinition,
	type HttpPlugin,
	type HttpRouteDefinition,
} from './index.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

test('preserves exact route and plugin input types', () => {
	const route = httpRoute({
		method: 'GET',
		path: '/typed',
		protocol: { name: 'fixture.typed', version: '1' },
		handle: () => new Response('typed'),
	})

	expectTypeOf(route).toEqualTypeOf<
		HttpRouteDefinition<
			'GET',
			'/typed',
			Readonly<{ readonly name: 'fixture.typed'; readonly version: '1' }>
		>
	>()
	expectTypeOf(httpPlugin({ appId: 'typed-app' })).toEqualTypeOf<HttpPlugin>()
	expectTypeOf<IsAny<typeof route>>().toEqualTypeOf<false>()

	// @ts-expect-error -- appId is mandatory public routing identity.
	httpPlugin({})
	// @ts-expect-error -- the HTTP package does not accept future Master options yet.
	httpPlugin({ appId: 'typed-app', master: { enabled: true } })
	httpRoute({
		method: 'GET',
		path: '/invalid-result',
		protocol: { name: 'fixture.typed', version: '1' },
		// @ts-expect-error -- handlers must return a Fetch Response.
		handle: () => 'invalid',
	})
})

test('types immutable endpoint providers and mount-table replacements', () => {
	const mount = httpMount({
		path: '/typed-mount',
		protocol: { name: 'fixture.mount', version: '1' },
		handle: () => new Response('mounted'),
	})
	const provider = provideHttpEndpoints({
		contributionId: 'typed-endpoints',
		create: ({ schemas }) => {
			expectTypeOf(schemas.get('Missing')).not.toBeAny()
			return mount
		},
	})

	expectTypeOf(
		provider.token.capabilityId,
	).toEqualTypeOf<'ultimabase.http.endpoints'>()
	expectTypeOf(mount).toExtend<HttpEndpointDefinition>()

	const table = new HttpApplicationMountTable({
		applicationProtocolVersion: httpApplicationProtocolVersion,
		originalHeaderMode: httpOriginalHeaderMode,
		ownership: 'external',
	})
	type MountResult = ReturnType<HttpApplicationMountTable['mount']>
	expectTypeOf<MountResult>().toEqualTypeOf<HttpApplicationMountTable>()

	void table.fetch({
		request: new Request('http://localhost'),
		// @ts-expect-error -- normalized headers cannot replace original header evidence.
		headers: new Headers(),
	})
})
