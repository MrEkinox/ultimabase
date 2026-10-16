import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
	UltimaBase,
	compileValidationPlans,
	readFieldTypeState,
	type CompiledApplication,
} from '@ultimabase/core'
import { contributeApplication, plugin } from '@ultimabase/core/plugin'

import { softDeletePlugin } from './plugin.js'
import { createSoftDeletePersistenceRewriter } from './replace-delete.js'

const App = UltimaBase.use(softDeletePlugin())
const declare = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
	})
// The same schema with `softDelete: true`, then with the command mode.
const declareLogical = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
		softDelete: true,
	})
const declareCommand = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
		softDelete: { mode: 'command' },
	})

const schemaSurface = (
	application: Readonly<{ compile(): CompiledApplication }>,
	className: string,
) =>
	application
		.compile()
		.schemaSurfaces.find(({ schema }) => schema.className === className)

const commandNames = [
	'purgeMany',
	'purgeOne',
	'restoreMany',
	'restoreOne',
	'softDeleteMany',
	'softDeleteOne',
]

describe('softDeletePlugin', () => {
	it('declares only its exact schema and visibility powers', () => {
		const instance = softDeletePlugin()

		expect(instance.manifest).toMatchObject({
			capabilities: {
				provides: [
					{ contributionId: 'permissions' },
					{ contributionId: 'visibility' },
					{ contributionId: 'delete' },
				],
				requires: [],
			},
			environment: [],
			identity: { pluginId: '@ultimabase/soft-delete-plugin' },
		})
		expect(instance.manifest.privileges.map(({ name }) => name)).toEqual([
			'schema:declare',
			'model:extend',
			'operation:declare',
			'runtime:constrain',
			'persistence:rewrite',
			// No transport binding: transports expose commands by rule (ADR-0325).
		])
	})

	it('attaches the same six commands to both modes and none elsewhere', async () => {
		const Logical = declareLogical('CommandsLogical')
		const Command = declareCommand('CommandsCommand')
		const Plain = declare('CommandsPlain')
		const application = new App({
			logger: false,
			schemas: [Logical, Command, Plain],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		for (const schema of [Logical, Command]) {
			const surface = schemaSurface(application, schema.className)
			expect([...(surface?.schemaMutations.keys() ?? [])].sort()).toEqual(
				commandNames,
			)
			expect(surface?.schemaMutations.get('softDeleteOne')).toMatchObject({
				mutation: {
					authority: 'request',
					checkReadable: 'before',
					effect: 'update',
					name: 'ultimabase.soft-delete-plugin.soft-delete.soft-delete-one',
					returning: 'after',
					target: 'one',
				},
			})
			expect(surface?.schemaMutations.get('restoreMany')).toMatchObject({
				mutation: { authority: 'request', effect: 'update', target: 'many' },
			})
			expect(surface?.schemaMutations.get('purgeOne')).toMatchObject({
				mutation: {
					authority: 'master',
					effect: 'delete',
					returning: 'before',
				},
			})
			// Results have no model methods (ADR-0310).
			expect(surface).not.toHaveProperty('modelMutations')
		}
		expect(
			schemaSurface(application, Plain.className)?.schemaMutations.size ?? 0,
		).toBe(0)
	})

	it('rewrites native deletes of the default mode only', async () => {
		const Logical = declareLogical('RewriteLogical')
		const Command = declareCommand('RewriteCommand')
		const Plain = declare('RewritePlain')
		const instance = softDeletePlugin()
		const application = new (UltimaBase.use(instance))({
			logger: false,
			schemas: [Logical, Command, Plain],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		const rewriter = createSoftDeletePersistenceRewriter(
			application.compile().schemas,
			instance.manifest.identity,
		)
		expect(rewriter).toMatchObject({
			operations: ['delete-one'],
			schemas: [Logical],
		})
	})

	it('keeps rewrite plans isolated between applications', async () => {
		const LogicalDocument = declareLogical('IsolatedRewriteDocument')
		const CommandDocument = declareCommand('IsolatedRewriteDocument')
		const first = softDeletePlugin()
		const second = softDeletePlugin()
		const logicalApplication = new (UltimaBase.use(first))({
			logger: false,
			schemas: [LogicalDocument],
		})
		onTestFinished(() => logicalApplication.dispose())
		const commandApplication = new (UltimaBase.use(second))({
			logger: false,
			schemas: [CommandDocument],
		})
		onTestFinished(() => commandApplication.dispose())

		await logicalApplication.initialize()
		await logicalApplication.dispose()
		await commandApplication.initialize()
		expect(
			createSoftDeletePersistenceRewriter(
				logicalApplication.compile().schemas,
				first.manifest.identity,
			).schemas,
		).toStrictEqual([LogicalDocument])
		expect(
			createSoftDeletePersistenceRewriter(
				commandApplication.compile().schemas,
				second.manifest.identity,
			).schemas,
		).toStrictEqual([])
	})

	it('does not install the option through import side effects', async () => {
		// Declared where Soft Delete is installed, registered where it is not.
		const Document = App.Schema.define({
			className: 'MissingSoftDeletePlugin',
			fields: (field) => ({ title: field.string() }),
			softDelete: true,
		})
		const application = new UltimaBase({ schemas: [Document] })
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Unknown schema option: softDelete',
		)
	})

	it('adds the server-written fields only to schemas that set softDelete', async () => {
		const Logical = declareLogical('FieldsLogical')
		const Command = declareCommand('FieldsCommand')
		const Plain = declare('FieldsPlain')
		const application = new App({
			logger: false,
			schemas: [Logical, Command, Plain],
		})
		onTestFinished(() => application.dispose())

		await application.initialize()
		expect(
			application.compile().schemas.get(Command.className)?.definition,
		).toHaveProperty('softDelete', { mode: 'command' })
		expect(
			application.compile().schemas.get(Logical.className)?.definition,
		).toHaveProperty('softDelete', {})
		for (const schema of [Logical, Command]) {
			expect(schema.persistedFields.isDeleted).toMatchObject({
				kind: 'boolean',
				options: { default: false, required: true },
			})
			expect(schema.persistedFields.deletedAt).toMatchObject({
				kind: 'dateTime',
			})
			for (const field of ['isDeleted', 'deletedAt'] as const) {
				const declared = schema.persistedFields[field]
				if (declared === undefined) throw new TypeError(`Missing ${field}`)
				expect(schema.provenance.fields[field]).toMatchObject({
					contributionId: `softDelete.${field}`,
					owner: {
						kind: 'plugin',
						pluginId: '@ultimabase/soft-delete-plugin',
					},
				})
				expect(readFieldTypeState(declared)).toMatchObject({
					create: 'forbidden',
					update: 'forbidden',
				})
				const plans = compileValidationPlans(schema)
				expect(plans.create.fields[field]?.presence).toBe('forbidden')
				expect(plans.update.fields[field]?.presence).toBe('forbidden')
			}
		}
		expect(Plain.fields).not.toHaveProperty('isDeleted')
		expect(Plain.fields).not.toHaveProperty('deletedAt')
	})

	it('rejects a developer field named like a soft-delete field', async () => {
		const Document = App.Schema.define({
			className: 'SoftDeleteCollisionDocument',
			fields: (field) => ({
				deletedAt: field.string(),
			}),
			softDelete: true,
		})
		const application = new App({ logger: false, schemas: [Document] })
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Duplicate schema field: SoftDeleteCollisionDocument.deletedAt',
		)
	})

	it('rejects invalid shape options before setup effects', async () => {
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
		const Invalid = App.Schema.define({
			className: 'InvalidSoftDeleteDocument',
			fields: (field) => ({ title: field.string() }),
			softDelete: { mode: 'explicit' } as never,
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

	it('cannot be installed twice in one application (review decision 2)', () => {
		const Twice = UltimaBase.use(softDeletePlugin(), softDeletePlugin())
		expect(() => new Twice({ logger: false, schemas: [] })).toThrow(
			'Plugin "@ultimabase/soft-delete-plugin" was declared more than once.',
		)
	})
})
