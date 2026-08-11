import { describe, expect, it } from 'vitest'

import {
	AccessSubjectReference,
	FrameworkApplication,
	FrameworkError,
	Schema,
	accessRoleResolverCapability,
	createApplication,
	definePlugin,
	optionalCapability,
	provideCapability,
	requireCapability,
	type AccessRoleResolver,
} from '../index.js'

const Article = Schema.define({
	className: 'OptionalAccessCapabilityArticle',
	fields: (field) => ({ title: field.string() }),
})
const editor = new AccessSubjectReference('role', 'editor')
const compatibleResolver: AccessRoleResolver = {
	hasRole: ({ role }) => Promise.resolve(role.value === editor.value),
}
const optionalRoleResolver = optionalCapability(
	accessRoleResolverCapability,
	'^1.0.0',
)
const requiredRoleResolver = requireCapability(
	accessRoleResolverCapability,
	'^1.0.0',
)

const unusedConsumer = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.access.consumer.unused',
	capabilities: { optional: [optionalRoleResolver] },
	setup: ({ capabilities }) => capabilities.get(optionalRoleResolver),
})

const createRoleConsumer = () =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.access.consumer.required',
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Exercises capability-backed Access policy registration.',
			},
		],
		capabilities: { requires: [requiredRoleResolver] },
		setup: ({ access, capabilities }) => {
			const roles = capabilities.get(requiredRoleResolver)

			access.schema(
				'editor-read',
				Article,
				{
					read: ({ context }) => roles.hasRole({ context, role: editor }),
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
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: name,
		capabilities: {
			provides: [
				provideCapability(accessRoleResolverCapability, {
					contributionId: 'role-resolver',
					create: () => ({ value: resolver }),
				}),
			],
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

	it('fails setup before infrastructure starts when a requirement is missing', () => {
		let infrastructureStarted = false
		const consumer = createRoleConsumer()
		const infrastructure = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.infrastructure',
			hooks: {
				connect: () => {
					infrastructureStarted = true
				},
			},
		})

		expect(
			() =>
				new FrameworkApplication({
					schemas: [Article],
					plugins: [consumer, infrastructure],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_MISSING' }))
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

			expect(requiredResolver).toBe(compatibleResolver)
			await application.dispose()
		},
	)

	it('rejects duplicate providers without replacing the first capability', async () => {
		const first = createProvider('fixture.roles.first', compatibleResolver)
		const second = createProvider('fixture.roles.second', compatibleResolver)
		let failure: unknown

		try {
			await createApplication({ schemas: [Article], plugins: [first, second] })
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({ code: 'PLUGIN_CAPABILITY_CONFLICT' })
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

		expect(first.getPlugin('fixture.access.consumer.required')).toBe(
			firstResolver,
		)
		expect(second.getPlugin('fixture.access.consumer.required')).toBe(
			secondResolver,
		)

		await Promise.all([first.dispose(), second.dispose()])
	})
})
