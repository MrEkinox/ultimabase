import {
	RequestContext,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type CapabilityProviderContribution,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import type { HttpBrowserPolicy } from './browser-policy.js'
import {
	compileHttpContextResolvers,
	httpContextResolver,
	resolveHttpContext,
	type HttpContextResolverBrowserPolicyValidator,
	type HttpContextResolverContributionsCapability,
	type HttpContextResolverInput,
} from './context.js'

const owner = { pluginId: 'fixture.browser-aware-resolver' } as const
const callbacks: ApplicationCallbackExecutor = {
	runApplication: (callback) => callback(),
	runPlugin: (_owner, callback) => callback(),
}
const requestExecution = {
	runWithContext: <TContext extends RequestContext, TResult>(
		context: TContext,
		callback: (context: TContext) => TResult,
	): TResult => callback(context),
} as unknown as ApplicationRequestExecutor
const browserPolicy: HttpBrowserPolicy = Object.freeze({
	allowedHeaders: Object.freeze([
		'X-UltimaBase-Application-Id',
		'Content-Type',
	]),
	allowedMethods: Object.freeze(['POST'] as const),
	allowedOrigins: Object.freeze(['https://client.example']),
	credentials: true,
	enabled: true,
	maxAgeSeconds: 60,
})

const contribution = (
	resolver: ReturnType<typeof httpContextResolver>,
): CapabilityProviderContribution<HttpContextResolverContributionsCapability> => ({
	contributionId: 'browser-aware',
	owner,
	pluginVersion: '1.0.0',
	value: [resolver],
})

describe('HTTP resolver browser policy', () => {
	it('validates at compilation and receives the same policy per request', async () => {
		const validateBrowserPolicy = vi.fn()
		let observed: HttpBrowserPolicy | undefined
		const resolvers = compileHttpContextResolvers(
			[
				contribution(
					httpContextResolver({
						validateBrowserPolicy,
						resolve: ({ browserPolicy: effective, context }) => {
							observed = effective
							return context
						},
					}),
				),
			],
			browserPolicy,
			callbacks,
		)
		expect(validateBrowserPolicy).toHaveBeenCalledExactlyOnceWith(browserPolicy)

		const initial = RequestContext.anonymous({
			requestId: 'browser-policy-request',
			source: 'fixture.browser-policy',
		})
		await resolveHttpContext(
			initial,
			new Request('https://api.example/context'),
			browserPolicy,
			resolvers,
			requestExecution,
			callbacks,
		)
		expect(observed).toBe(browserPolicy)
	})

	it('rejects an incompatible policy before request resolution', () => {
		const resolve = vi.fn(({ context }: HttpContextResolverInput) => context)
		expect(() =>
			compileHttpContextResolvers(
				[
					contribution(
						httpContextResolver({
							validateBrowserPolicy: () => {
								throw new TypeError('Browser policy is incompatible')
							},
							resolve,
						}),
					),
				],
				{ enabled: false },
				callbacks,
			),
		).toThrow('Browser policy is incompatible')
		expect(resolve).not.toHaveBeenCalled()
	})

	it('rejects asynchronous policy validation', () => {
		const asynchronousValidation = (() =>
			Promise.resolve()) as unknown as HttpContextResolverBrowserPolicyValidator
		expect(() =>
			compileHttpContextResolvers(
				[
					contribution(
						httpContextResolver({
							validateBrowserPolicy: asynchronousValidation,
							resolve: ({ context }) => context,
						}),
					),
				],
				browserPolicy,
				callbacks,
			),
		).toThrow('validation must be synchronous and return undefined')
	})
})
