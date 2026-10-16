import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import { plugin, contributeDeclarations } from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { hooksPlugin } from '../src/plugin.js'

const hooksDependency = {
	pluginId: '@ultimabase/hooks-plugin',
	version: '^0.0.0',
} as const
const HooksApplication = UltimaBase.use(hooksPlugin())

const createSchemaProvider = (schema: SchemaDefinition) =>
	plugin({
		core: '^0.0.0',
		dependencies: [hooksDependency],
		id: 'fixture.inline-hooks-provider',
		permissions: {
			'schema:declare':
				'Adds the schema used by the provenance regression fixture.',
		},
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.add({
						contributionId: 'owned-schema',
						schema,
						staticOptions: {},
					})
				},
			}),
		],
	})

describe('Hook contribution provenance', () => {
	it('accepts application-owned inline schema and field Hooks', async () => {
		const Post = HooksApplication.Schema.define({
			className: 'ApplicationOwnedInlineHooks',
			fields: (field) => ({
				title: field.string({
					hooks: { resolveInput: ({ value }) => value },
				}),
			}),
		}).with((plugins) =>
			plugins.hooks({
				beforeOperation: { create: () => undefined },
			}),
		)
		const application = new (UltimaBase.use(hooksPlugin()))({ schemas: [Post] })
		await application.initialize()

		await application.dispose()
	})

	it('rejects inline schema Hooks owned by a plugin', async () => {
		const Owned = HooksApplication.Schema.define({
			className: 'PluginOwnedInlineSchemaHooks',
			fields: (field) => ({ title: field.string() }),
		}).with((plugins) =>
			plugins.hooks({ beforeOperation: { create: () => undefined } }),
		)

		await expect(
			new (UltimaBase.use(createSchemaProvider(Owned), hooksPlugin()))({
				schemas: [],
			}).initialize(),
		).rejects.toThrow('plugins must use provideHookContributions()')
	})

	it('rejects inline field Hooks owned by a plugin', async () => {
		const Owned = HooksApplication.Schema.define({
			className: 'PluginOwnedInlineFieldHooks',
			fields: (field) => ({
				title: field.string({
					hooks: { resolveInput: ({ value }) => value },
				}),
			}),
		})

		await expect(
			new (UltimaBase.use(hooksPlugin(), createSchemaProvider(Owned)))({
				schemas: [],
			}).initialize(),
		).rejects.toThrow('plugins must use provideHookContributions()')
	})
})
