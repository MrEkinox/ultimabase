import { describe, expect, it } from 'vitest'

import {
	AccessSubjectReference,
	FrameworkApplication,
	FrameworkError,
	Schema,
	accessRoleResolverServiceToken,
	createApplication,
	definePlugin,
	stringField,
	type AccessRoleResolver,
} from '../index.js'

const Article = Schema.define({
	className: 'OptionalAccessCapabilityArticle',
	fields: { title: stringField() },
})
const editor = new AccessSubjectReference('role', 'editor')
const compatibleResolver: AccessRoleResolver = {
	hasRole: ({ role }) => Promise.resolve(role.value === editor.value),
}

const unusedConsumer = definePlugin({
	name: 'fixture.access.consumer.unused',
	setup: ({ services }) => services.getOptional(accessRoleResolverServiceToken),
})

const createRoleConsumer = () =>
	definePlugin({
		name: 'fixture.access.consumer.required',
		setup: ({ access, services }) => {
			const roles = services.require(accessRoleResolverServiceToken)

			access.schema(
				'editor-read',
				Article,
				{
					operation: {
						read: ({ context }) =>
							roles.get().hasRole({ context, role: editor }),
					},
				},
				{ master: 'enforce' },
			)

			return roles
		},
	})

const createProvider = <const TName extends string>(
	name: TName,
	resolver: AccessRoleResolver,
) =>
	definePlugin({
		name,
		setup: ({ services }) => {
			services.provide(accessRoleResolverServiceToken, resolver)
		},
	})

describe('optional Access capabilities', () => {
	it('keeps an absent provider valid while no contribution requires it', async () => {
		const application = await createApplication({
			schemas: [Article],
			plugins: [unusedConsumer],
		})

		expect(application.state).toBe('ready')
		await application.dispose()
	})

	it('fails setup before infrastructure starts when a requirement is missing', async () => {
		let infrastructureStarted = false
		const consumer = createRoleConsumer()
		const infrastructure = definePlugin({
			name: 'fixture.infrastructure',
			hooks: {
				connect: () => {
					infrastructureStarted = true
				},
			},
		})

		const application = new FrameworkApplication({
			schemas: [Article],
			plugins: [consumer, infrastructure],
		})

		await expect(application.start()).rejects.toMatchObject({
			code: 'SERVICE_NOT_FOUND',
			internalDetails: {
				requiredBy: 'fixture.access.consumer.required',
				service: 'ultimabase.access.role-resolver',
			},
		})
		expect(infrastructureStarted).toBe(false)
	})

	it.each([
		['official-compatible', 'fixture.roles.official'],
		['community-compatible', 'community.roles'],
	] as const)(
		'accepts one %s provider by neutral token identity',
		async (_label, providerName) => {
			const consumer = createRoleConsumer()
			const provider = createProvider(providerName, compatibleResolver)
			// The provider follows the consumer to prove setup order is irrelevant.
			const application = await createApplication({
				schemas: [Article],
				plugins: [consumer, provider],
			})
			const requiredResolver = application.getPlugin(
				'fixture.access.consumer.required',
			)

			expect(requiredResolver.get()).toBe(compatibleResolver)
			await application.dispose()
		},
	)

	it('rejects duplicate providers without replacing the first service', async () => {
		const first = createProvider('fixture.roles.first', compatibleResolver)
		const second = createProvider('fixture.roles.second', compatibleResolver)
		let failure: unknown

		try {
			await createApplication({ schemas: [Article], plugins: [first, second] })
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({ code: 'SERVICE_ALREADY_PROVIDED' })
	})

	it('keeps compatible providers and requirements application-local', async () => {
		const firstResolver: AccessRoleResolver = {
			hasRole: () => true,
		}
		const secondResolver: AccessRoleResolver = {
			hasRole: () => false,
		}
		const first = await createApplication({
			schemas: [Article],
			plugins: [
				createRoleConsumer(),
				createProvider('fixture.roles.first-app', firstResolver),
			],
		})
		const second = await createApplication({
			schemas: [Article],
			plugins: [
				createRoleConsumer(),
				createProvider('fixture.roles.second-app', secondResolver),
			],
		})

		expect(first.getPlugin('fixture.access.consumer.required').get()).toBe(
			firstResolver,
		)
		expect(second.getPlugin('fixture.access.consumer.required').get()).toBe(
			secondResolver,
		)

		await Promise.all([first.dispose(), second.dispose()])
	})
})
