import { describe, expect, it } from 'vitest'

import {
	defineCapability,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
	provideCapability,
	requireCapability,
} from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import {
	applicationSchemaMutationSurfaceCapability,
	type ApplicationSchemaMutationDescriptor,
} from './application-schema-mutation-surface.js'

const inspectedSurfaceCapability = defineCapability<
	readonly ApplicationSchemaMutationDescriptor[]
>()({
	capabilityId: 'fixture.inspected-schema-mutations',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([value]) => value,
})

const mutationSurfaceRequirement = requireCapability(
	applicationSchemaMutationSurfaceCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)

const defineFixture = (suffix: string) => {
	let inspected: readonly ApplicationSchemaMutationDescriptor[] = []
	const Post = Schema.define({
		className: `SchemaMutationSurface${suffix}`,
		fields: (field) => ({ title: field.string() }),
	})
	const archive = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: defineOperationValue((value) => value),
		name: `fixture.surface.archive-${suffix}`,
		returning: 'after',
		version: '1.0.0',
	})
	const owner = definePlugin({
		core: '^0.0.0',
		pluginId: `fixture.surface-owner-${suffix}`,
		privileges: [
			{ name: 'model:extend', reason: 'Adds the fixture mutation.' },
			{ name: 'operation:declare', reason: 'Declares the fixture mutation.' },
		] as const,
		version: '1.0.0',
		declare: ({ models, operations }) => {
			operations.declare(archive)
			models.extend(Post, {
				contributionId: 'archive-surface',
				schemaMutations: {
					archive: { mutation: archive, surfaces: ['schema', 'model'] },
				},
			})
		},
	})
	const inspector = definePlugin({
		capabilities: [
			provideCapability(inspectedSurfaceCapability, {
				contributionId: 'inspection',
				create: ({ capabilities, schemas }) => {
					const schema = schemas.get(Post.className)
					if (schema === undefined) {
						throw new TypeError('Fixture schema is unavailable')
					}
					inspected = capabilities.get(mutationSurfaceRequirement).get(schema)
					return { value: inspected }
				},
			}),
			mutationSurfaceRequirement,
		],
		core: '^0.0.0',
		pluginId: `fixture.surface-inspector-${suffix}`,
		version: '1.0.0',
	})

	return { archive, inspector, owner, Post, read: () => inspected }
}

describe('application schema mutation surface capability', () => {
	it('exposes one immutable descriptor per exact schema command', async () => {
		const fixture = defineFixture('exact')
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [fixture.owner, fixture.inspector],
			schemas: [fixture.Post],
		})

		try {
			await application.initialize()
			const descriptors = fixture.read()
			expect(descriptors).toHaveLength(1)
			expect(descriptors[0]).toMatchObject({
				command: 'archive',
				mutation: { name: fixture.archive.name },
				owner: { pluginId: fixture.owner.manifest.identity.pluginId },
				schema: fixture.Post,
			})
			expect(Object.isFrozen(descriptors)).toBe(true)
			expect(Object.isFrozen(descriptors[0])).toBe(true)
		} finally {
			await application.dispose()
		}
	})

	it('cannot be provided by plugins', () => {
		const fixture = defineFixture('protected')
		const forged = {
			get: () => [],
		}
		const declarations = [
			provideCapability(applicationSchemaMutationSurfaceCapability, {
				contributionId: 'forged-provider',
				create: () => ({ value: forged }),
			}),
		]

		for (const declaration of declarations) {
			const plugin = definePlugin({
				capabilities: [declaration],
				core: '^0.0.0',
				pluginId: `fixture.surface-forgery-${declaration.kind}`,
				version: '1.0.0',
			})

			expect(
				() =>
					new FrameworkApplication({
						pluginPrivileges: { logger: false },
						plugins: [fixture.owner, fixture.inspector, plugin],
						schemas: [fixture.Post],
					}),
			).toThrow('Application schema mutation surface')
		}
	})
})
