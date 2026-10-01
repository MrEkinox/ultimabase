import { describe, expect, it } from 'vitest'
import { createApplication } from './framework-application.js'

import {
	FrameworkError,
	requestPrincipalResolverCapability,
	plugin as createPlugin,
	contributeApplication,
	optionalCapability,
	provideCapability,
	type RequestPrincipalResolver,
} from '../index.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

const Principal = UltimaBase.Schema.define({
	className: 'OptionalAccessPrincipal',
	fields: () => ({}),
})
const firstPrincipal = Principal.pointer('first-principal')
const secondPrincipal = Principal.pointer('second-principal')
const optionalPrincipalResolver = optionalCapability(
	requestPrincipalResolverCapability,
	'^1.0.0',
)

const optionalConsumer = createPlugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.access.principal-consumer',
	contributions: [
		optionalPrincipalResolver,
		contributeApplication(({ capabilities }) => ({
			exports: capabilities.get(optionalPrincipalResolver),
		})),
	],
})

const createProvider = <const TName extends string>(
	name: TName,
	resolver: RequestPrincipalResolver,
) =>
	createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: name,
		contributions: [
			provideCapability(requestPrincipalResolverCapability, {
				contributionId: 'principal-resolver',
				create: () => ({ value: resolver }),
			}),
		],
	})

describe('optional Access principal providers', () => {
	it('keeps an absent authentication provider valid', async () => {
		const application = await createApplication({
			schemas: [Principal],
			plugins: [optionalConsumer],
		})

		expect(
			application.getPlugin('fixture.access.principal-consumer'),
		).toBeUndefined()
		await application.dispose()
	})

	it.each([
		['auth-compatible', 'fixture.auth.provider'],
		['community-compatible', 'community.identity.provider'],
	] as const)(
		'accepts one %s provider through the neutral token',
		async (_label, providerName) => {
			const resolver: RequestPrincipalResolver<typeof firstPrincipal> = {
				resolveCurrent: () => Promise.resolve(firstPrincipal),
			}
			const provider = createProvider(providerName, resolver)
			const application = await createApplication({
				schemas: [Principal],
				plugins: [optionalConsumer, provider],
			})

			expect(application.getPlugin('fixture.access.principal-consumer')).toBe(
				resolver,
			)
			await application.dispose()
		},
	)

	it('rejects duplicate providers without replacing the first', async () => {
		const resolver: RequestPrincipalResolver = {
			resolveCurrent: () => firstPrincipal,
		}
		const first = createProvider('fixture.auth.first', resolver)
		const second = createProvider('fixture.auth.second', resolver)
		let failure: unknown

		try {
			await createApplication({
				schemas: [Principal],
				plugins: [first, second],
			})
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({ code: 'PLUGIN_CAPABILITY_CONFLICT' })
	})

	it('keeps resolver instances isolated between applications', async () => {
		const firstResolver: RequestPrincipalResolver = {
			resolveCurrent: () => firstPrincipal,
		}
		const secondResolver: RequestPrincipalResolver = {
			resolveCurrent: () => secondPrincipal,
		}
		const first = await createApplication({
			schemas: [Principal],
			plugins: [
				optionalConsumer,
				createProvider('fixture.auth.first-app', firstResolver),
			],
		})
		expect(first.getPlugin('fixture.access.principal-consumer')).toBe(
			firstResolver,
		)
		await first.dispose()
		const second = await createApplication({
			schemas: [Principal],
			plugins: [
				optionalConsumer,
				createProvider('fixture.auth.second-app', secondResolver),
			],
		})

		expect(second.getPlugin('fixture.access.principal-consumer')).toBe(
			secondResolver,
		)

		await Promise.all([first.dispose(), second.dispose()])
	})
})
