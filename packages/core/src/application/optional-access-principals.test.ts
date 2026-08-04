import { describe, expect, it } from 'vitest'

import {
	FrameworkError,
	Schema,
	accessPrincipalResolverServiceToken,
	createApplication,
	definePlugin,
	type AccessPrincipalResolver,
} from '../index.js'

const Principal = Schema.define({
	className: 'OptionalAccessPrincipal',
	fields: {},
})
const firstPrincipal = Principal.pointer('first-principal')
const secondPrincipal = Principal.pointer('second-principal')

const optionalConsumer = definePlugin({
	name: 'fixture.access.principal-consumer',
	setup:
		({ services }) =>
		// Deferred lookup keeps optional providers independent from setup order.
		() =>
			services.getOptional(accessPrincipalResolverServiceToken),
})

const createProvider = <const TName extends string>(
	name: TName,
	resolver: AccessPrincipalResolver,
) =>
	definePlugin({
		name,
		setup: ({ services }) => {
			services.provide(accessPrincipalResolverServiceToken, resolver)
		},
	})

describe('optional Access principal providers', () => {
	it('keeps an absent authentication provider valid', async () => {
		const application = await createApplication({
			schemas: [Principal],
			plugins: [optionalConsumer],
		})

		expect(
			application.getPlugin('fixture.access.principal-consumer')(),
		).toBeUndefined()
		await application.dispose()
	})

	it.each([
		['auth-compatible', 'fixture.auth.provider'],
		['community-compatible', 'community.identity.provider'],
	] as const)(
		'accepts one %s provider through the neutral token',
		async (_label, providerName) => {
			const resolver: AccessPrincipalResolver<typeof firstPrincipal> = {
				resolveCurrent: () => Promise.resolve(firstPrincipal),
			}
			const provider = createProvider(providerName, resolver)
			const application = await createApplication({
				schemas: [Principal],
				plugins: [optionalConsumer, provider],
			})

			expect(application.getPlugin('fixture.access.principal-consumer')()).toBe(
				resolver,
			)
			await application.dispose()
		},
	)

	it('rejects duplicate providers without replacing the first', async () => {
		const resolver: AccessPrincipalResolver = {
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
		expect(failure).toMatchObject({ code: 'SERVICE_ALREADY_PROVIDED' })
	})

	it('keeps resolver instances isolated between applications', async () => {
		const firstResolver: AccessPrincipalResolver = {
			resolveCurrent: () => firstPrincipal,
		}
		const secondResolver: AccessPrincipalResolver = {
			resolveCurrent: () => secondPrincipal,
		}
		const first = await createApplication({
			schemas: [Principal],
			plugins: [
				optionalConsumer,
				createProvider('fixture.auth.first-app', firstResolver),
			],
		})
		const second = await createApplication({
			schemas: [Principal],
			plugins: [
				optionalConsumer,
				createProvider('fixture.auth.second-app', secondResolver),
			],
		})

		expect(first.getService(accessPrincipalResolverServiceToken)).toBe(
			firstResolver,
		)
		expect(second.getService(accessPrincipalResolverServiceToken)).toBe(
			secondResolver,
		)

		await Promise.all([first.dispose(), second.dispose()])
	})
})
