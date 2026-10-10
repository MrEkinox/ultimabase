import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
	UltimaBase,
	compileValidationPlans,
	contributeApplication,
	plugin,
	readFieldTypegenState,
	type CompiledApplication,
	type FieldBuilder,
} from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'

import type { SoftDeleteSchemaOption } from './contracts.js'
import { softDeletePlugin } from './plugin.js'
import { createSoftDeletePersistenceRewriter } from './replace-delete.js'

const SoftDeleteSchemaApplication = UltimaBase.use(softDeletePlugin())

const documentSchema = (
	className: string,
	softDelete?: SoftDeleteSchemaOption,
) =>
	SoftDeleteSchemaApplication.Schema.define({
		className,
		...(softDelete === undefined ? {} : { softDelete }),
		fields: (field) => ({ title: field.string() }),
	})

const schemaSurface = (
	application: Readonly<{ compile(): CompiledApplication }>,
	className: string,
) =>
	application
		.compile()
		.typegenGraph.schemaSurfaces.find(
			({ schema }) => schema.className === className,
		)

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
				],
				requires: [],
			},
			environment: [],
			identity: { pluginId: '@ultimabase/soft-delete-plugin' },
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares schema fields, options or schemas.',
				},
				{
					name: 'model:extend',
					reason: 'Adds plugin commands to application schemas.',
				},
				{ name: 'operation:declare', reason: 'Declares plugin operations.' },
				{
					name: 'runtime:constrain',
					reason: 'Registers protected Runtime constraints.',
				},
				{
					name: 'persistence:rewrite',
					reason:
						'Declares schema mutations that rewrite persistence. Registers persistence plan rewriters.',
				},
				{ name: 'transport:expose', reason: 'Binds operations to transports.' },
				{
					name: 'typegen:reference',
					reason: 'References Typegen types in operations.',
				},
			],
		})
	})

	it('attaches Master administration only to enabled schema handles', async () => {
		const Explicit = documentSchema('AdministrationExplicit', 'explicit')
		const Replace = documentSchema('AdministrationReplace', 'replace-delete')
		const Inherited = documentSchema('AdministrationInherited')
		const Disabled = documentSchema('AdministrationDisabled', false)
		const application = new (UltimaBase.use(
			softDeletePlugin({ defaultMode: 'replace-delete' }),
		))({
			logger: false,
			schemas: [Explicit, Replace, Inherited, Disabled],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		try {
			for (const schema of [Explicit, Replace, Inherited]) {
				const surface = schemaSurface(application, schema.className)
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
				// Results have no model methods (ADR-0310).
				expect(surface).not.toHaveProperty('modelMutations')
			}
			const disabled = schemaSurface(application, Disabled.className)
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
		const application = new (UltimaBase.use(
			softDeletePlugin({ defaultMode: 'explicit' }),
		))({
			logger: false,
			schemas: [Direct, Inherited, Replace, Disabled],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		try {
			for (const schema of [Direct, Inherited]) {
				const command = schemaSurface(
					application,
					schema.className,
				)?.schemaMutations.get('softDelete')
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
					schemaSurface(application, schema.className)?.schemaMutations.has(
						'softDelete',
					),
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
		const application = new (UltimaBase.use(plugin))({
			logger: false,
			schemas: [Direct, Inherited, Explicit, Disabled],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		try {
			const rewriter = createSoftDeletePersistenceRewriter(
				application.compile().schemas,
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
		const replaceApplication = new (UltimaBase.use(replacePlugin))({
			logger: false,
			schemas: [ReplaceDocument],
		})
		onTestFinished(() => replaceApplication.dispose())
		const explicitApplication = new (UltimaBase.use(explicitPlugin))({
			logger: false,
			schemas: [ExplicitDocument],
		})
		onTestFinished(() => explicitApplication.dispose())

		await replaceApplication.initialize()
		await replaceApplication.dispose()
		await explicitApplication.initialize()
		try {
			const replacePlan = createSoftDeletePersistenceRewriter(
				replaceApplication.compile().schemas,
				replacePlugin.manifest.identity,
				'replace-delete',
			)
			const explicitPlan = createSoftDeletePersistenceRewriter(
				explicitApplication.compile().schemas,
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
		// The stale runtime definition deliberately bypasses source diagnostics.
		const Document = UltimaBase.Schema.define({
			className: 'MissingSoftDeletePlugin',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
			softDelete: 'explicit',
		} as never)
		const application = new UltimaBase({ schemas: [Document] })
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Unknown schema option: softDelete',
		)
	})

	it('adds the protected tombstone only to enabled application schemas', async () => {
		const Explicit = documentSchema('ExplicitSoftDeleteDocument', 'explicit')
		const Disabled = documentSchema('DisabledSoftDeleteDocument', false)
		const Inherited = documentSchema('InheritedSoftDeleteDocument')
		const application = new (UltimaBase.use(
			softDeletePlugin({ defaultMode: 'replace-delete' }),
		))({
			logger: false,
			schemas: [Explicit, Disabled, Inherited],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		expect(
			application.compile().schemas.get(Explicit.className)?.definition,
		).toHaveProperty('softDelete', 'explicit')
		expect(
			application.compile().schemas.get(Disabled.className)?.definition,
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
		const Document = SoftDeleteSchemaApplication.Schema.define({
			className: 'SoftDeleteCollisionDocument',
			fields: (field) => ({
				isDeleted: field.boolean({ default: false, required: true }),
			}),
			softDelete: 'explicit',
		})
		const application = new (UltimaBase.use(softDeletePlugin()))({
			logger: false,
			schemas: [Document],
		})
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Duplicate schema field: SoftDeleteCollisionDocument.isDeleted',
		)
	})

	it('rejects stale invalid schema values before setup effects', async () => {
		const setup = vi.fn()
		const observer = plugin({
			core: '^0.0.0',
			id: 'fixture.soft-delete-setup-observer',
			version: '1.0.0',
			contributions: [
				contributeApplication((context) => {
					setup(context)
					return { exports: undefined }
				}),
			],
		})
		// A persisted stale value must still fail before plugin setup effects.
		const Invalid = SoftDeleteSchemaApplication.Schema.define({
			className: 'InvalidSoftDeleteDocument',
			fields: (field) => ({ title: field.string() }),
			softDelete: 'disabled' as never,
		})
		const application = new (UltimaBase.use(softDeletePlugin(), observer))({
			logger: false,
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
		const application = new (UltimaBase.use(
			softDeletePlugin({ instanceId: 'editorial' }),
			softDeletePlugin({ instanceId: 'legal' }),
		))({
			logger: false,
			schemas: [Document],
		})
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Ambiguous schema option owner for "softDelete"',
		)
	})

	it('keeps source-owned options and defaults isolated between applications', () => {
		const Editorial = documentSchema('IsolatedSoftDeleteDocument', 'explicit')
		const Legal = documentSchema('IsolatedSoftDeleteDocument')
		const editorial = generateApplicationTypes({
			ultimabase: new (UltimaBase.use(
				softDeletePlugin({
					defaultMode: 'explicit',
					instanceId: 'editorial',
				}),
			))({ logger: false, schemas: [Editorial] }),
			applicationId: 'editorial',
		})
		const legal = generateApplicationTypes({
			ultimabase: new (UltimaBase.use(
				softDeletePlugin({
					defaultMode: 'replace-delete',
					instanceId: 'legal',
				}),
			))({ logger: false, schemas: [Legal] }),
			applicationId: 'legal',
		})

		// Source-owned options no longer need a parallel Typegen descriptor. The
		// compiled schema and mutation snapshots below still prove isolated defaults.
		expect(editorial.snapshot.options).toStrictEqual([])
		expect(legal.snapshot.options).toStrictEqual([])
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
