import {
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
} from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { definePlugin } from './definition.js'
import { extensionHandlerKey } from './extension-handlers.js'

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

describe('extension handler validation', () => {
	it('accepts handlers registered by the expected plugin owner', async () => {
		const events: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: permissionsPluginName,
			setup: ({ registries }) => {
				registries.extensions.register(
					extensionHandlerKey('schema', schemaPermissions.name),
					{ apply: () => true },
				)
				registries.extensions.register(
					extensionHandlerKey('field', fieldVisibility.name),
					{ apply: () => true },
				)
			},
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

		// Application creation validates declarations but does not connect infrastructure.
		expect(events).toStrictEqual([])
		await application.start()
		expect(events).toStrictEqual(['connect'])
		await application.dispose()
	})

	it('reports missing schema handlers with the expected plugin', async () => {
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

	it('reports nested field paths and a wrongly claimed handler owner', async () => {
		const wrongOwner = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.wrong-owner',
			setup: ({ registries }) => {
				registries.extensions.register(
					extensionHandlerKey('schema', schemaPermissions.name),
					{},
				)
				registries.extensions.register(
					extensionHandlerKey('field', fieldVisibility.name),
					{},
				)
			},
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
				actualPluginName: 'fixture.wrong-owner',
			},
		})
	})

	it('rejects duplicate handlers through the shared contribution policy', async () => {
		const registerHandler = (pluginName: string) =>
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: pluginName,
				setup: ({ registries }) => {
					registries.extensions.register(
						extensionHandlerKey('schema', schemaPermissions.name),
						{},
					)
				},
			})

		await expect(
			createApplication({
				schemas: [],
				plugins: [
					registerHandler('fixture.first'),
					registerHandler('fixture.second'),
				],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: {
				kind: 'duplicate-contribution',
				contributionName: 'schema:fixture.class-permissions',
				pluginNames: ['fixture.first', 'fixture.second'],
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

	it('validates handler key inputs for JavaScript callers', () => {
		expect(extensionHandlerKey('schema', 'fixture.permissions')).toBe(
			'schema:fixture.permissions',
		)
		expect(() => {
			// @ts-expect-error -- Runtime validation rejects unknown scopes.
			extensionHandlerKey('object', 'fixture.permissions')
		}).toThrow(new TypeError('Unknown extension scope: object'))
		expect(() => extensionHandlerKey('field', '')).toThrow(
			new TypeError('extensionName must be a non-empty string'),
		)
	})
})
