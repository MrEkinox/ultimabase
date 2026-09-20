import { onTestFinished } from 'vitest'
import {
	FrameworkApplication,
	Schema,
	compileValidationPlans,
	definePlugin,
	readFieldTypegenState,
	type SchemaOptions,
} from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { describe, expect, it, vi } from 'vitest'

import type { SoftDeleteSchemaOption } from './contracts.js'
import { softDeletePlugin } from './plugin.js'
import { createSoftDeletePersistenceRewriter } from './replace-delete.js'

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
	it('declares only its exact schema and visibility powers', () => {
		const plugin = softDeletePlugin()

		expect(plugin.manifest).toMatchObject({
			capabilities: {
				provides: [
					{
						contributionId: 'official-soft-delete-visibility',
					},
					{
						contributionId: 'official-soft-delete-replace-delete',
					},
					{ contributionId: 'official-soft-delete-handler' },
					{ contributionId: 'official-soft-delete-rest-binding' },
					{ contributionId: 'official-soft-delete-graphql-binding' },
					{ contributionId: 'official-soft-delete-restore-handler' },
					{ contributionId: 'official-soft-delete-purge-handler' },
				],
				requires: [],
			},
			environment: [],
			identity: { pluginId: '@ultimabase/soft-delete-plugin' },
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares the direct soft-delete schema option.',
				},
				{
					name: 'runtime:constrain',
					reason: 'Keeps tombstoned rows outside ordinary operations.',
				},
				{
					name: 'persistence:rewrite',
					reason: 'Persists soft-delete effects as atomic tombstone updates.',
				},
				{
					name: 'operation:declare',
					reason: 'Declares soft-delete and administration mutations.',
				},
				{
					name: 'model:extend',
					reason: 'Adds soft-delete commands to enabled schema handles.',
				},
				{
					name: 'transport:expose',
					reason: 'Binds explicit soft delete to REST and GraphQL.',
				},
				{
					name: 'typegen:reference',
					reason: 'Preserves payload-free soft-delete commands in Typegen.',
				},
			],
		})
	})

	it('attaches Master administration only to enabled schema handles', async () => {
		const Explicit = documentSchema('AdministrationExplicit', 'explicit')
		const Replace = documentSchema('AdministrationReplace', 'replace-delete')
		const Inherited = documentSchema('AdministrationInherited')
		const Disabled = documentSchema('AdministrationDisabled', false)
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin({ defaultMode: 'replace-delete' })],
			schemas: [Explicit, Replace, Inherited, Disabled],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		try {
			for (const schema of [Explicit, Replace, Inherited]) {
				const surface = application.getSchemaSurface(schema.className)
				expect([...(surface?.schemaMutations.keys() ?? [])]).toEqual(
					expect.arrayContaining(['restore', 'purge']),
				)
				expect(surface?.schemaMutations.get('restore')).toMatchObject({
					mutation: {
						authority: 'master',
						effect: 'update',
						name: 'ultimabase.soft-delete.restore',
						returning: 'after',
					},
				})
				expect(surface?.schemaMutations.get('purge')).toMatchObject({
					mutation: {
						authority: 'master',
						effect: 'delete',
						name: 'ultimabase.soft-delete.purge',
						returning: 'before',
					},
				})
				expect(surface?.modelMutations.has('restore')).toBe(false)
				expect(surface?.modelMutations.has('purge')).toBe(false)
			}
			const disabled = application.getSchemaSurface(Disabled.className)
			expect(disabled?.schemaMutations.has('restore')).toBe(false)
			expect(disabled?.schemaMutations.has('purge')).toBe(false)
		} finally {
			await application.dispose()
		}
	})

	it('attaches the logical command only to explicit schema and model handles', async () => {
		const Direct = documentSchema('DirectExplicitSoftDelete', 'explicit')
		const Inherited = documentSchema('InheritedExplicitSoftDelete')
		const Replace = documentSchema(
			'ReplaceWithoutSoftDeleteCommand',
			'replace-delete',
		)
		const Disabled = documentSchema('DisabledWithoutSoftDeleteCommand', false)
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin({ defaultMode: 'explicit' })],
			schemas: [Direct, Inherited, Replace, Disabled],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		try {
			for (const schema of [Direct, Inherited]) {
				const command = application
					.getSchemaSurface(schema.className)
					?.schemaMutations.get('softDelete')
				expect(command).toMatchObject({
					mutation: {
						authority: 'request',
						effect: 'update',
						name: 'ultimabase.soft-delete.soft-delete',
						returning: 'after',
					},
				})
			}
			for (const schema of [Replace, Disabled]) {
				expect(
					application
						.getSchemaSurface(schema.className)
						?.schemaMutations.has('softDelete'),
				).toBe(false)
			}
		} finally {
			await application.dispose()
		}
	})

	it('compiles replace-delete targets without matching explicit or disabled schemas', async () => {
		const Direct = documentSchema(
			'DirectReplaceDeleteDocument',
			'replace-delete',
		)
		const Inherited = documentSchema('InheritedReplaceDeleteDocument')
		const Explicit = documentSchema('ExplicitHardDeleteDocument', 'explicit')
		const Disabled = documentSchema('DisabledHardDeleteDocument', false)
		const plugin = softDeletePlugin({
			defaultMode: 'replace-delete',
			instanceId: 'replace-targets',
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Direct, Inherited, Explicit, Disabled],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		try {
			const rewriter = createSoftDeletePersistenceRewriter(
				application.schemas,
				plugin.manifest.identity,
				'replace-delete',
			)

			expect(rewriter).toMatchObject({
				operations: ['delete-one'],
				schemas: [Direct, Inherited],
			})
		} finally {
			await application.dispose()
		}
	})

	it('keeps replace-delete plans isolated between applications', async () => {
		const ReplaceDocument = documentSchema('IsolatedReplaceDeleteDocument')
		const ExplicitDocument = documentSchema('IsolatedReplaceDeleteDocument')
		const replacePlugin = softDeletePlugin({ defaultMode: 'replace-delete' })
		const explicitPlugin = softDeletePlugin({ defaultMode: 'explicit' })
		const replaceApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacePlugin],
			schemas: [ReplaceDocument],
		})
		onTestFinished(() => replaceApplication.dispose())
		const explicitApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [explicitPlugin],
			schemas: [ExplicitDocument],
		})
		onTestFinished(() => explicitApplication.dispose())

		await replaceApplication.initialize()
		await replaceApplication.dispose()
		await explicitApplication.initialize()
		try {
			const replacePlan = createSoftDeletePersistenceRewriter(
				replaceApplication.schemas,
				replacePlugin.manifest.identity,
				'replace-delete',
			)
			const explicitPlan = createSoftDeletePersistenceRewriter(
				explicitApplication.schemas,
				explicitPlugin.manifest.identity,
				'explicit',
			)

			expect(replacePlan.schemas).toStrictEqual([ReplaceDocument])
			expect(explicitPlan.schemas).toStrictEqual([])
		} finally {
			await replaceApplication.dispose()
			await explicitApplication.dispose()
		}
	})

	it('does not install the direct option through import side effects', async () => {
		const Document = documentSchema('MissingSoftDeletePlugin', 'explicit')
		const application = new FrameworkApplication({
			plugins: [],
			schemas: [Document],
		})
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Unknown schema option: softDelete',
		)
	})

	it('adds the protected tombstone only to enabled application schemas', async () => {
		const Explicit = documentSchema('ExplicitSoftDeleteDocument', 'explicit')
		const Disabled = documentSchema('DisabledSoftDeleteDocument', false)
		const Inherited = documentSchema('InheritedSoftDeleteDocument')
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin({ defaultMode: 'replace-delete' })],
			schemas: [Explicit, Disabled, Inherited],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		expect(
			application.schemas.get(Explicit.className)?.definition,
		).toHaveProperty('softDelete', 'explicit')
		expect(
			application.schemas.get(Disabled.className)?.definition,
		).toHaveProperty('softDelete', false)
		for (const schema of [Explicit, Inherited]) {
			const tombstone = schema.persistedFields.isDeleted
			expect(tombstone).toMatchObject({
				kind: 'boolean',
				options: { default: false, required: true },
			})
			if (tombstone === undefined) {
				throw new TypeError('Expected the compiled soft-delete tombstone')
			}
			expect(schema.provenance.fields.isDeleted).toMatchObject({
				contributionId: 'official-soft-delete-tombstone',
				owner: {
					kind: 'plugin',
					pluginId: '@ultimabase/soft-delete-plugin',
				},
			})
			expect(readFieldTypegenState(tombstone)).toMatchObject({
				create: 'forbidden',
				object: 'required',
				update: 'forbidden',
			})
			const plans = compileValidationPlans(schema)
			expect(plans.create.fields.isDeleted?.presence).toBe('forbidden')
			expect(plans.update.fields.isDeleted?.presence).toBe('forbidden')
		}
		expect(Disabled.fields.isDeleted).toBeUndefined()
		await application.dispose()
	})

	it('rejects an enabled schema tombstone collision deterministically', async () => {
		const Document = Schema.define({
			className: 'SoftDeleteCollisionDocument',
			fields: (field) => ({
				isDeleted: field.boolean({ default: false, required: true }),
			}),
			softDelete: 'explicit',
		} as SchemaOptions<'SoftDeleteCollisionDocument'> & {
			readonly softDelete: SoftDeleteSchemaOption
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin()],
			schemas: [Document],
		})
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Duplicate schema field: SoftDeleteCollisionDocument.isDeleted',
		)
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
		onTestFinished(() => application.dispose())

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
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Ambiguous schema option owner for "softDelete"',
		)
	})

	it('keeps option provenance and defaults isolated between applications', () => {
		const Editorial = documentSchema('IsolatedSoftDeleteDocument', 'explicit')
		const Legal = documentSchema('IsolatedSoftDeleteDocument')
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
		expect(editorial.snapshot.surfaces[0]?.schemaMutations).toEqual([
			expect.objectContaining({ name: 'purge' }),
			expect.objectContaining({ name: 'restore' }),
			expect.objectContaining({ name: 'softDelete' }),
		])
		expect(editorial.contents).toContain('PluginSchemaMutationNoInput as')
		expect(editorial.contents).not.toContain(
			'"ultimabase.soft-delete.soft-delete", "1.0.0", unknown',
		)
		expect(legal.snapshot.surfaces[0]?.schemaMutations).toEqual([
			expect.objectContaining({ name: 'purge' }),
			expect.objectContaining({ name: 'restore' }),
		])
		expect(editorial.fingerprint).not.toBe(legal.fingerprint)
	})
})
