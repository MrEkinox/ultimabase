import { expectTypeOf, test } from 'vitest'

import {
	dispatchHttpApplicationRequest,
	type HttpApplication,
	httpBrowserBootstrapRoute,
	httpMount,
	httpContextResolver,
	httpPlugin,
	httpRoute,
	normalizeHttpBrowserBootstrapPath,
	provideHttpEndpoints,
	provideHttpContextResolvers,
	type HttpBrowserPolicy,
	type HttpBrowserBootstrapRouteDefinition,
	type HttpContextResolverBrowserPolicyValidator,
	type HttpContextResolverDefinition,
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
	const browserRoute = httpBrowserBootstrapRoute({
		path: '/explorer',
		protocol: { name: 'fixture.explorer', version: '1' },
		handle: () => new Response('explorer'),
	})
	expectTypeOf(browserRoute).toEqualTypeOf<
		HttpBrowserBootstrapRouteDefinition<
			'/explorer',
			Readonly<{ readonly name: 'fixture.explorer'; readonly version: '1' }>
		>
	>()
	expectTypeOf(
		normalizeHttpBrowserBootstrapPath('/explorer', 'Explorer path'),
	).toEqualTypeOf<string>()

	// ADR-0323: appId is optional and Master is enabled with `true`.
	expectTypeOf(httpPlugin()).toEqualTypeOf<HttpPlugin>()
	httpPlugin({})
	httpPlugin({ appId: 'typed-app', master: true })
	// @ts-expect-error -- the former `{ enabled: true }` shape is gone.
	httpPlugin({ master: { enabled: true } })
	httpPlugin({
		routes: {
			'GET /status': (request, { context }) => {
				expectTypeOf(request).toEqualTypeOf<Request>()
				expectTypeOf(context.access.mode).toEqualTypeOf<
					'anonymous' | 'master'
				>()
				return Response.json({ ok: true })
			},
			'POST /upload': {
				bodyLimit: 10_485_760,
				handle: () => new Response(null, { status: 204 }),
				rateLimit: { perMinute: 5 },
			},
		},
	})
	httpPlugin({
		routes: {
			// @ts-expect-error -- route keys start with an HTTP method.
			'FETCH /status': () => new Response(),
		},
	})
	httpPlugin({ appId: 'typed-app', requestTimeoutMs: 1_000 })
	httpRoute({
		method: 'GET',
		path: '/invalid-result',
		protocol: { name: 'fixture.typed', version: '1' },
		// @ts-expect-error -- handlers must return a Fetch Response.
		handle: () => 'invalid',
	})
})

test('types immutable HTTP context resolver contributions', () => {
	const validateBrowserPolicy: HttpContextResolverBrowserPolicyValidator = (
		policy,
	) => {
		expectTypeOf(policy).toEqualTypeOf<HttpBrowserPolicy>()
	}
	const resolver = httpContextResolver({
		validateBrowserPolicy,
		resolve: ({ browserPolicy, context }) => {
			expectTypeOf(browserPolicy).toEqualTypeOf<HttpBrowserPolicy>()
			return context
		},
	})
	expectTypeOf(resolver).toEqualTypeOf<HttpContextResolverDefinition>()
	const provider = provideHttpContextResolvers({
		contributionId: 'typed-context',
		create: () => resolver,
	})
	expectTypeOf(
		provider.token.capabilityId,
	).toEqualTypeOf<'ultimabase.http.context-resolvers'>()

	httpContextResolver({
		// @ts-expect-error -- a resolver cannot return non-context credential data.
		resolve: () => ({ principal: 'forged' }),
	})
	httpContextResolver({
		// @ts-expect-error -- policy validation must be callable.
		validateBrowserPolicy: 'invalid',
		resolve: ({ context }) => context,
	})
})

test('types immutable endpoint providers and sole-owner dispatch', () => {
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

	// A server clears its optional owner before teardown without losing safe errors.
	const dispatch = (application: HttpApplication | undefined) => {
		expectTypeOf(
			dispatchHttpApplicationRequest(application, {
				request: new Request('http://localhost'),
				originalHeaders: [],
			}),
		).toEqualTypeOf<Promise<Response>>()
		void dispatchHttpApplicationRequest(application, {
			request: new Request('http://localhost'),
			// @ts-expect-error -- normalized headers cannot replace original header evidence.
			headers: new Headers(),
		})
	}
	void dispatch
})
