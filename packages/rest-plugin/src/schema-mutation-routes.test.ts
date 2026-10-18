import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import {
	plugin,
	provideCapability,
	type PluginIdentity,
} from '@ultimabase/core/plugin'
import { initializeRestTestApplication as createApplication } from './application.test-support.js'
import { describe, expect, it } from 'vitest'

import { restPlugin } from './plugin.js'
import { createRestRouteFragment, restRouteGraphCapability } from './routes.js'
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

// The plan lists the commands REST serves; Core decides which ones
// (application-exposure-planning.test.ts, tests/expose.test.ts).
const planOf = (
	mutations: readonly ReturnType<typeof descriptor>[],
	native: readonly string[] = [],
) => ({
	schemas: [
		...new Set([...native, ...mutations.map(({ schema }) => schema)]),
	].map((className) => ({
		className,
		methods: [
			...(native.includes(className) ? [{ kind: 'native' as const }] : []),
			...mutations
				.filter(({ schema }) => schema === className)
				.map((binding) => ({ binding, kind: 'plugin' as const })),
		],
	})),
})

const compile = async (
	schemas: readonly SchemaDefinition[],
	plan: ReturnType<typeof planOf>,
) => {
	const application = await createApplication({
		logger: false,
		plugins: [restPlugin()],
		schemas,
	})
	try {
		return compileRestSchemaMutationRouteFragment({
			basePath: '/api',
			owner,
			plan,
			pluginVersion: '0.0.0',
			schemas: application.compile().schemas,
		})
	} finally {
		await application.dispose()
	}
}

describe('REST schema mutation route compilation', () => {
	it('emits one route per plugin command the plan serves', async () => {
		const Served = UltimaBase.Schema.define({
			className: 'RestMutationServed',
			fields: () => ({}),
		})
		const Native = UltimaBase.Schema.define({
			className: 'RestMutationNative',
			fields: () => ({}),
		})

		const fragment = await compile(
			[Served, Native],
			planOf(
				[
					descriptor(Served.className, 'publishOne'),
					descriptor(Served.className, 'archiveOne'),
					// A schema the registry does not know is skipped.
					descriptor('RestMutationUnknown', 'publishOne'),
				],
				[Native.className],
			),
		)
		expect(fragment.routes.map(({ path }) => path)).toStrictEqual([
			'/api/classes/RestMutationServed/{id}/publish-one',
			'/api/classes/RestMutationServed/{id}/archive-one',
		])
	})

	it('rejects commands without one canonical REST path segment', async () => {
		const Invalid = UltimaBase.Schema.define({
			className: 'RestMutationInvalidPath',
			fields: () => ({}),
		})
		await expect(
			compile([Invalid], planOf([descriptor(Invalid.className, '_private')])),
		).rejects.toThrow('has no canonical path segment')
	})

	it('lets the shared route graph reject canonical command collisions', async () => {
		const Collision = UltimaBase.Schema.define({
			className: 'RestMutationCollision',
			fields: () => ({}),
		})
		const fragment = await compile(
			[Collision],
			planOf([
				descriptor(Collision.className, 'softDelete'),
				descriptor(Collision.className, 'soft_delete'),
			]),
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
