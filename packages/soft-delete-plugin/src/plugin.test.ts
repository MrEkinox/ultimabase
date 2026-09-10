import { FrameworkApplication, Schema, definePlugin } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { describe, expect, it, vi } from 'vitest'

import type { SoftDeleteSchemaOption } from './contracts.js'
import { softDeletePlugin } from './plugin.js'

const documentSchema = (
	className: string,
	softDelete?: SoftDeleteSchemaOption | 'disabled',
) =>
	Schema.define({
		className,
		...(softDelete === undefined ? {} : { softDelete }),
		fields: (field) => ({ title: field.string() }),
	})

describe('softDeletePlugin', () => {
	it('declares only its exact option privilege and no capability or environment power', () => {
		const plugin = softDeletePlugin()

		expect(plugin.manifest).toMatchObject({
			capabilities: { decorates: [], provides: [], replaces: [], requires: [] },
			environment: [],
			identity: { pluginId: '@ultimabase/soft-delete-plugin' },
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares the direct soft-delete schema option.',
				},
			],
		})
	})

	it('does not install the direct option through import side effects', async () => {
		const Document = documentSchema('MissingSoftDeletePlugin', 'explicit')
		const application = new FrameworkApplication({
			plugins: [],
			schemas: [Document],
		})

		await expect(application.initialize()).rejects.toThrow(
			'Unknown schema option: softDelete',
		)
	})

	it('normalizes valid JavaScript schema options without running product behavior', async () => {
		const Explicit = documentSchema('ExplicitSoftDeleteDocument', 'explicit')
		const Disabled = documentSchema('DisabledSoftDeleteDocument', false)
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin({ defaultMode: 'replace-delete' })],
			schemas: [Explicit, Disabled],
		})

		await application.initialize()
		expect(
			application.schemas.get(Explicit.className)?.definition,
		).toHaveProperty('softDelete', 'explicit')
		expect(
			application.schemas.get(Disabled.className)?.definition,
		).toHaveProperty('softDelete', false)
		expect(Explicit.fields.isDeleted).toBeUndefined()
		await application.dispose()
	})

	it('rejects stale invalid schema values before setup effects', async () => {
		const setup = vi.fn()
		const observer = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.soft-delete-setup-observer',
			setup,
			version: '1.0.0',
		})
		const Invalid = documentSchema('InvalidSoftDeleteDocument', 'disabled')
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin(), observer],
			schemas: [Invalid],
		})

		await expect(application.initialize()).rejects.toThrow(
			'InvalidSoftDeleteDocument.softDelete is invalid for option owner @ultimabase/soft-delete-plugin',
		)
		expect(setup).not.toHaveBeenCalled()
	})

	it('rejects ambiguous direct-option ownership between explicit instances', async () => {
		const Document = documentSchema('AmbiguousSoftDeleteDocument', 'explicit')
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				softDeletePlugin({ instanceId: 'editorial' }),
				softDeletePlugin({ instanceId: 'legal' }),
			],
			schemas: [Document],
		})

		await expect(application.initialize()).rejects.toThrow(
			'Ambiguous schema option owner for "softDelete"',
		)
	})

	it('keeps option provenance and defaults isolated between applications', () => {
		const Editorial = documentSchema('IsolatedSoftDeleteDocument', 'explicit')
		const Legal = documentSchema('IsolatedSoftDeleteDocument', 'explicit')
		const editorial = generateApplicationTypes({
			application: new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [
					softDeletePlugin({
						defaultMode: 'explicit',
						instanceId: 'editorial',
					}),
				],
				schemas: [Editorial],
			}),
			applicationId: 'editorial',
		})
		const legal = generateApplicationTypes({
			application: new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [
					softDeletePlugin({
						defaultMode: 'replace-delete',
						instanceId: 'legal',
					}),
				],
				schemas: [Legal],
			}),
			applicationId: 'legal',
		})

		expect(editorial.snapshot.options[0]).toMatchObject({
			name: 'softDelete',
			owner: { instanceId: 'editorial' },
			staticOptions: { defaultMode: 'explicit' },
		})
		expect(legal.snapshot.options[0]).toMatchObject({
			name: 'softDelete',
			owner: { instanceId: 'legal' },
			staticOptions: { defaultMode: 'replace-delete' },
		})
		expect(editorial.fingerprint).not.toBe(legal.fingerprint)
	})
})
