import {
	createApplication,
	plugin,
	contributeDeclarations,
	Schema,
	type SchemaDefinition,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { hooksPlugin } from '../src/plugin.js'

const hooksDependency = {
	pluginId: '@ultimabase/hooks-plugin',
	version: '^0.0.0',
} as const

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
		const Post = Schema.define({
			className: 'ApplicationOwnedInlineHooks',
			fields: (field) => ({
				title: field.string({
					hooks: { resolveInput: ({ value }) => value },
				}),
			}),
			hooks: {
				beforeOperation: { create: () => undefined },
			},
		})
		const application = await createApplication({
			plugins: [hooksPlugin()],
			schemas: [Post],
		})

		await application.dispose()
	})

	it('rejects inline schema Hooks owned by a plugin', async () => {
		const Owned = Schema.define({
			className: 'PluginOwnedInlineSchemaHooks',
			fields: (field) => ({ title: field.string() }),
			hooks: { beforeOperation: { create: () => undefined } },
		})

		await expect(
			createApplication({
				plugins: [createSchemaProvider(Owned), hooksPlugin()],
				schemas: [],
			}),
		).rejects.toThrow('plugins must use provideHookContributions()')
	})

	it('rejects inline field Hooks owned by a plugin', async () => {
		const Owned = Schema.define({
			className: 'PluginOwnedInlineFieldHooks',
			fields: (field) => ({
				title: field.string({
					hooks: { resolveInput: ({ value }) => value },
				}),
			}),
		})

		await expect(
			createApplication({
				plugins: [hooksPlugin(), createSchemaProvider(Owned)],
				schemas: [],
			}),
		).rejects.toThrow('plugins must use provideHookContributions()')
	})
})
