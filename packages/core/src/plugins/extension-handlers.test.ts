import {
	defineFieldExtension,
	defineSchemaExtension,
	Schema,
} from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { definePlugin } from './definition.js'

const permissionsPluginName = 'fixture.permissions'
const schemaPermissions = defineSchemaExtension(
	'fixture.class-permissions',
	{ read: true },
	permissionsPluginName,
)
const fieldVisibility = defineFieldExtension(
	'fixture.field-visibility',
	{ read: true },
	permissionsPluginName,
)

const protectedSchema = Schema.define({
	className: 'ProtectedPost',
	fields: (field) => ({
		title: field.string({ extensions: [fieldVisibility] }),
		metadata: field.object({
			fields: (field) => ({
				secret: field.string({ extensions: [fieldVisibility] }),
			}),
		}),
	}),
	extensions: [schemaPermissions],
})

describe('extension owner validation', () => {
	it('accepts extensions owned by an installed plugin identity', async () => {
		const events: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: permissionsPluginName,
			hooks: {
				connect: () => {
					events.push('connect')
				},
			},
		})

		const application = await createApplication({
			schemas: [protectedSchema],
			plugins: [plugin],
		})

		expect(events).toStrictEqual([])
		await application.start()
		expect(events).toStrictEqual(['connect'])
		await application.dispose()
	})

	it('reports a missing schema-extension owner', async () => {
		await expect(
			createApplication({ schemas: [protectedSchema], plugins: [] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_EXTENSION_HANDLER_MISSING',
			message:
				'Schema "ProtectedPost" extension "fixture.class-permissions" requires a handler from plugin "fixture.permissions".',
			internalDetails: {
				kind: 'missing-extension-handler',
				scope: 'schema',
				schemaClassName: 'ProtectedPost',
				extensionName: 'fixture.class-permissions',
				expectedPluginName: permissionsPluginName,
			},
		})
	})

	it('reports nested field paths without accepting an unrelated plugin', async () => {
		const wrongOwner = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.wrong-owner',
		})
		const fieldOnlySchema = Schema.define({
			className: 'NestedPost',
			fields: (field) => ({
				metadata: field.object({
					fields: (field) => ({
						secret: field.string({ extensions: [fieldVisibility] }),
					}),
				}),
			}),
		})

		await expect(
			createApplication({ schemas: [fieldOnlySchema], plugins: [wrongOwner] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_EXTENSION_HANDLER_MISSING',
			message:
				'Field "NestedPost.metadata.secret" extension "fixture.field-visibility" requires a handler from plugin "fixture.permissions".',
			internalDetails: {
				kind: 'missing-extension-handler',
				scope: 'field',
				schemaClassName: 'NestedPost',
				fieldPath: 'metadata.secret',
				extensionName: 'fixture.field-visibility',
				expectedPluginName: permissionsPluginName,
			},
		})
	})

	it('cleans initialized plugins when validation and disposal both fail', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.cleanup-failure',
			hooks: {
				dispose: () => {
					throw new Error('cleanup failed')
				},
			},
		})

		await expect(
			createApplication({ schemas: [protectedSchema], plugins: [plugin] }),
		).rejects.toEqual(
			expect.objectContaining({
				name: 'AggregateError',
				message:
					'Application validation failed and cleanup reported an additional error.',
				errors: [
					expect.objectContaining({
						code: 'PLUGIN_EXTENSION_HANDLER_MISSING',
					}),
					expect.objectContaining({ message: 'cleanup failed' }),
				],
			}),
		)
	})
})
