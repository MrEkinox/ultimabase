import {
	UltimaBase,
	type ApplicationSchemaMutationTransportPlan,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	plugin,
	provideCapability,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
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
	bound: true,
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
	schemas: readonly SchemaDefinition[],
	mutations: ApplicationSchemaMutationTransportPlan<
		typeof restProtocol
	>['mutations'],
	defaultRule?: boolean,
) => {
	const application = await createApplication({
		logger: false,
		plugins: [restPlugin()],
		schemas,
	})
	try {
		return compileRestSchemaMutationRouteFragment({
			basePath: '/api',
			defaultRule,
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
		// A boolean rule covers commands too; named commands are tested with a
		// real command in tests/schema-mutation-http.test.ts.
		const Explicit = RestSchemaApplication.Schema.define({
			className: 'RestMutationExplicit',
			fields: () => ({}),
		}).with((plugins) => plugins.rest(true))
		const Disabled = RestSchemaApplication.Schema.define({
			className: 'RestMutationDisabled',
			fields: () => ({}),
		}).with((plugins) => plugins.rest(false))
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
			'/api/classes/RestMutationExplicit/{id}/publish-now',
		])
		// ADR-0324: a command is exposed only when named, or when everything is.
		const builtIn = await compile([Explicit, Disabled, Inherited], mutations)
		expect(builtIn.routes.map(({ path }) => path)).toStrictEqual([
			'/api/classes/RestMutationExplicit/{id}/publish-now',
		])

		const enabledByDefault = await compile(
			[Explicit, Disabled, Inherited],
			mutations,
			true,
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
			compile([Invalid], [descriptor(Invalid.className, '_private')], true),
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
			true,
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
