import {
	UltimaBase,
	plugin,
	provideCapability,
	type ApplicationSchemaMutationTransportPlan,
	type PluginIdentity,
} from '@ultimabase/core'
import { initializeRestTestApplication as createApplication } from './application.test-support.js'
import { describe, expect, it } from 'vitest'

import { restPlugin } from './plugin.js'
import {
	createRestRouteFragment,
	restProtocol,
	restRouteGraphCapability,
} from './routes.js'
import { compileRestSchemaMutationRouteFragment } from './schema-mutation-routes.js'

const owner: PluginIdentity = {
	pluginId: 'fixture.rest-mutation-owner',
}
const descriptor = (
	schema: string,
	command: string,
	authority: 'master' | 'request' = 'request',
) => ({
	authority,
	command,
	effect: 'update' as const,
	errors: [] as const,
	metadata: { errors: {} },
	mutation: `fixture.rest-mutation.${command}`,
	owner: {
		pluginId: 'fixture.rest-mutation-owner',
		version: '1.0.0',
	},
	returning: 'after' as const,
	schema,
	version: '1.0.0',
})

const compile = async (
	schemas: readonly ReturnType<typeof UltimaBase.Schema.define>[],
	mutations: ApplicationSchemaMutationTransportPlan<
		typeof restProtocol
	>['mutations'],
	defaultRoutes?: false | Readonly<{ readonly mutations: boolean }>,
) => {
	const application = await createApplication({
		logger: false,
		plugins: [restPlugin()],
		schemas,
	})
	try {
		return compileRestSchemaMutationRouteFragment({
			basePath: '/api/v1',
			defaultRoutes,
			owner,
			plan: { mutations, transport: restProtocol },
			pluginVersion: '0.0.0',
			schemas: application.compile().schemas,
		})
	} finally {
		await application.dispose()
	}
}

describe('REST schema mutation route compilation', () => {
	it('applies schema-local enablement and never emits Master routes', async () => {
		const RestSchemaApplication = UltimaBase.use(restPlugin())
		const explicitRoutes = { rest: { mutations: true } }
		const Explicit = RestSchemaApplication.Schema.define({
			...explicitRoutes,
			className: 'RestMutationExplicit',
			fields: () => ({}),
		})
		const disabledRoutes = { rest: { mutations: false } }
		const Disabled = RestSchemaApplication.Schema.define({
			...disabledRoutes,
			className: 'RestMutationDisabled',
			fields: () => ({}),
		})
		const Inherited = RestSchemaApplication.Schema.define({
			className: 'RestMutationInherited',
			fields: () => ({}),
		})
		const mutations = [
			descriptor(Explicit.className, 'publishNow'),
			descriptor(Disabled.className, 'publishNow'),
			descriptor(Inherited.className, 'publishNow'),
			descriptor(Explicit.className, 'purge', 'master'),
		]

		const disabledByDefault = await compile(
			[Explicit, Disabled, Inherited],
			mutations,
			false,
		)
		expect(disabledByDefault.routes.map(({ path }) => path)).toStrictEqual([
			'/api/v1/classes/RestMutationExplicit/{id}/publish-now',
		])

		const enabledByDefault = await compile(
			[Explicit, Disabled, Inherited],
			mutations,
			{ mutations: true },
		)
		expect(
			enabledByDefault.routes.map((route) =>
				'schema' in route ? route.schema : undefined,
			),
		).toStrictEqual(['RestMutationExplicit', 'RestMutationInherited'])
	})

	it('rejects commands without one canonical REST path segment', async () => {
		const Invalid = UltimaBase.Schema.define({
			className: 'RestMutationInvalidPath',
			fields: () => ({}),
		})
		await expect(
			compile([Invalid], [descriptor(Invalid.className, '_private')]),
		).rejects.toThrow('has no canonical path segment')
	})

	it('lets the shared route graph reject canonical command collisions', async () => {
		const Collision = UltimaBase.Schema.define({
			className: 'RestMutationCollision',
			fields: () => ({}),
		})
		const fragment = await compile(
			[Collision],
			[
				descriptor(Collision.className, 'softDelete'),
				descriptor(Collision.className, 'soft_delete'),
			],
		)
		expect(fragment.routes[0]?.path).toBe(fragment.routes[1]?.path)
		const collisionPlugin = plugin({
			contributions: [
				provideCapability(restRouteGraphCapability, {
					contributionId: 'colliding-routes',
					create: () => ({
						value: createRestRouteFragment(fragment.routes),
					}),
				}),
			],
			core: '^0.0.0',
			id: 'fixture.rest-mutation-collision',
			permissions: { 'transport:expose': 'Exercises route collisions.' },
			version: '1.0.0',
		})
		await expect(
			createApplication({
				logger: false,
				plugins: [collisionPlugin, restPlugin()],
				schemas: [Collision],
			}),
		).rejects.toThrow('REST route collision for POST')
	})
})
