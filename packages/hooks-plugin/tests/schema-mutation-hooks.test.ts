import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	stringField,
	type DatabaseAdapter,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { waitForAfterCommit } from '@ultimabase/testing/plugins'

import {
	defineEvent,
	hooksPlugin,
	onEvent,
	provideHookContributions,
	provideHookEvent,
	schemaHooks,
} from '../src/index.js'
import type { HookContext } from '../src/index.js'
import {
	SchemaMutationHookAdapter,
	schemaMutationHookId,
} from './schema-mutation-hooks.test-support.js'
import {
	RequestContext,
	requestSources,
	addSchemaField,
	contributeDeclarations,
	contributeSchemaMutation,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	provideCapability,
	type PluginDefinition,
	type PluginSourceState,
} from '@ultimabase/core/plugin'

interface RuntimeMutationHookInput {
	readonly context: HookContext
	readonly input: Readonly<{ readonly reason: string }>
	readonly item: Readonly<Record<string, unknown>> | null
	readonly mutation: Readonly<Record<string, unknown>>
	readonly originalItem: Readonly<Record<string, unknown>>
	readonly target: Readonly<{
		readonly id: string
		readonly schema: SchemaDefinition
	}>
}

let fixtureIndex = 0
const archiveCompleted = defineEvent<{ readonly id: string }>(
	'fixture.archive.completed',
)

const HookSchemaApplication = UltimaBase.use(hooksPlugin())

const databasePlugin = (adapter: DatabaseAdapter, id: number) =>
	plugin({
		core: '^0.0.0',
		id: `fixture.schema-mutation-hook-database-${String(id)}`,
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
	})

const createArchiveParts = (trace: string[], hooks?: unknown) => {
	fixtureIndex += 1
	const id = fixtureIndex
	const archive = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: defineOperationValue((value, path) => {
			if (!isPlainRecord(value) || typeof value.reason !== 'string') {
				throw new TypeError(`${path}.reason must be a string`)
			}
			return immutableRecord({ reason: value.reason })
		}),
		name: `fixture.schema-mutation-hook.archive-${String(id)}`,
		returning: 'after',
		select: { title: true },
		version: '1.0.0',
	})
	const Document = HookSchemaApplication.Schema.define({
		className: `SchemaMutationHookDocument${String(id)}`,
		fields: (field) => ({ title: field.string() }),
	}).with((plugins) =>
		hooks === undefined ? plugins : plugins.hooks(hooks as never),
	)
	const owner = plugin({
		id: `fixture.schema-mutation-hook-owner-${String(id)}`,
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'model:extend': 'Adds archive.',
			'operation:declare': 'Declares archive.',
			'persistence:rewrite': 'Persists archive.',
			'schema:declare': 'Adds workflow state.',
		},
		contributions: [
			contributeSchemaMutation({
				mutation: archive,
				resolve: () => {
					trace.push('handler')
					return { data: { workflowState: 'archived' } }
				},
			}),
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'workflow-state',
								field: stringField(),
								name: 'workflowState',
							}),
						],
						targets: schemas.select({ className: Document.className }),
					})
				},
				models: ({ models }) => {
					models.extend(
						{ className: Document.className },
						{
							contributionId: 'archive-surface',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['schema'] },
							},
						},
					)
				},
			}),
		],
	})
	const adapter = new SchemaMutationHookAdapter(trace)
	const database = databasePlugin(adapter, id)
	const execute = (
		ultimabase: UltimaBase<
			readonly SchemaDefinition[],
			readonly PluginDefinition[],
			PluginSourceState
		>,
		options?: unknown,
	) => {
		const method = Reflect.get(ultimabase.schema(Document), 'archive') as (
			input: unknown,
			options?: unknown,
		) => Promise<unknown>
		return method(
			{
				id: schemaMutationHookId,
				input: { reason: 'release' },
				select: { title: true, workflowState: true },
			},
			options,
		)
	}

	return { adapter, database, Document, execute, id, owner }
}

const createHookProvider = (
	id: string,
	schema: SchemaDefinition,
	hooks: unknown,
) =>
	plugin({
		core: '^0.0.0',
		peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
		id: id,
		permissions: { 'runtime:intercept': 'Observes archive lifecycle.' },
		version: '1.0.0',
		contributions: [
			provideHookContributions(`${id}-contribution`, () =>
				schemaHooks(schema, hooks as never),
			),
		],
	})

describe('schema mutation Hooks', () => {
	it('runs exact provider and developer branches around persistence and events', async () => {
		const trace: string[] = []
		const inputs: RuntimeMutationHookInput[] = []
		let runNestedQuery: () => Promise<unknown> = () => Promise.resolve()
		const nativeUpdate = vi.fn()
		const nativeDelete = vi.fn()
		const inlineHooks = {
			afterOperation: {
				archive: (input: RuntimeMutationHookInput) => {
					trace.push('inline:after')
					inputs.push(input)
					input.context.emit(archiveCompleted, { id: input.target.id })
				},
				delete: nativeDelete,
				update: nativeUpdate,
			},
			beforeOperation: {
				archive: async (input: RuntimeMutationHookInput) => {
					trace.push('inline:before')
					inputs.push(input)
					await runNestedQuery()
				},
				delete: nativeDelete,
				update: nativeUpdate,
			},
		}
		const parts = createArchiveParts(trace, inlineHooks)
		const Audit = HookSchemaApplication.Schema.define({
			className: `SchemaMutationHookAudit${String(parts.id)}`,
			fields: (field) => ({ action: field.string({ required: true }) }),
		})
		runNestedQuery = () => Audit.createOne({ data: { action: 'archive' } })
		const first = createHookProvider(
			'fixture.schema-hook-provider-first',
			parts.Document,
			{
				afterOperation: {
					archive: [
						() => trace.push('first:after:0'),
						() => trace.push('first:after:1'),
					],
				},
				beforeOperation: {
					archive: [
						(input: RuntimeMutationHookInput) => {
							trace.push('first:before:0')
							expect(input.context.hook.owner).toMatchObject({
								kind: 'plugin',
								pluginName: 'fixture.schema-hook-provider-first',
							})
						},
						() => trace.push('first:before:1'),
					],
				},
			},
		)
		const second = createHookProvider(
			'fixture.schema-hook-provider-second',
			parts.Document,
			{
				afterOperation: { archive: () => trace.push('second:after') },
				beforeOperation: { archive: () => trace.push('second:before') },
			},
		)
		const events = plugin({
			core: '^0.0.0',
			id: 'fixture.schema-hook-events',
			permissions: { 'runtime:observe': 'Consumes committed events.' },
			version: '1.0.0',
			contributions: [
				provideHookEvent(
					'archive-events',
					onEvent(archiveCompleted, () => {
						trace.push('event')
					}),
				),
			],
		})
		const ultimabase = new (UltimaBase.use(
			first,
			second,
			events,
			hooksPlugin(),
			parts.owner,
			parts.database,
		))({
			logger: false,
			schemas: [parts.Document, Audit],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(parts.execute(ultimabase)).resolves.toMatchObject({
				workflowState: 'archived',
			})
			// Events reach consumers after commit, without delaying the call.
			await waitForAfterCommit()
			expect(trace).toStrictEqual([
				'begin',
				'prepare:delete-one',
				'handler',
				'first:before:0',
				'first:before:1',
				'second:before',
				'inline:before',
				'prepare:create-one',
				'execute:create-one',
				'execute:update-one',
				'inline:after',
				'second:after',
				'first:after:0',
				'first:after:1',
				'commit',
				'event',
			])
			expect(nativeUpdate).not.toHaveBeenCalled()
			expect(nativeDelete).not.toHaveBeenCalled()
			expect(parts.adapter.transactions).toHaveLength(1)
			expect(inputs).toHaveLength(2)
			expect(inputs[0]).toMatchObject({
				input: { reason: 'release' },
				item: { workflowState: 'archived' },
				originalItem: { workflowState: 'published' },
				target: { id: schemaMutationHookId },
			})
			expect(inputs[1]).toMatchObject({ item: { workflowState: 'archived' } })
			expect(inputs[0]?.context.hook).toMatchObject({
				declarationBranch: 'archive',
				operationKind: 'plugin-schema-mutation',
				owner: { kind: 'application' },
				phase: 'beforeOperation',
				target: { className: parts.Document.className, kind: 'schema' },
			})
			expect(inputs[1]?.context.hook).toMatchObject({
				declarationBranch: 'archive',
				operationKind: 'plugin-schema-mutation',
				phase: 'afterOperation',
			})
			expect(Object.keys(inputs[0]?.mutation ?? {}).sort()).toStrictEqual([
				'authority',
				'effect',
				'kind',
				'name',
				'version',
			])
			expect(Object.isFrozen(inputs[0])).toBe(true)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('rolls back failures before or after the physical effect', async () => {
		const beforeTrace: string[] = []
		const before = createArchiveParts(beforeTrace, {
			beforeOperation: {
				archive: () => {
					throw new Error('before rejected')
				},
			},
		})
		const beforeApp = new (UltimaBase.use(
			hooksPlugin(),
			before.owner,
			before.database,
		))({
			logger: false,
			schemas: [before.Document],
		})
		onTestFinished(() => beforeApp.dispose())
		await beforeApp.start()
		await expect(before.execute(beforeApp)).rejects.toThrow('before rejected')
		expect(beforeTrace).toStrictEqual([
			'begin',
			'prepare:delete-one',
			'handler',
			'rollback',
		])
		await beforeApp.dispose()

		const afterTrace: string[] = []
		const after = createArchiveParts(afterTrace, {
			afterOperation: {
				archive: () => {
					throw new Error('after rejected')
				},
			},
		})
		const afterApp = new (UltimaBase.use(
			hooksPlugin(),
			after.owner,
			after.database,
		))({
			logger: false,
			schemas: [after.Document],
		})
		onTestFinished(() => afterApp.dispose())
		await afterApp.start()
		await expect(after.execute(afterApp)).rejects.toThrow('after rejected')
		expect(afterTrace).toStrictEqual([
			'begin',
			'prepare:delete-one',
			'handler',
			'execute:update-one',
			'rollback',
		])
		await afterApp.dispose()
	})

	it('propagates cancellation raised during a custom before Hook', async () => {
		const trace: string[] = []
		const controller = new AbortController()
		const parts = createArchiveParts(trace, {
			beforeOperation: {
				archive: () => {
					trace.push('hook:cancel')
					controller.abort()
				},
			},
		})
		const ultimabase = new (UltimaBase.use(
			hooksPlugin(),
			parts.owner,
			parts.database,
		))({
			logger: false,
			schemas: [parts.Document],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			const context = RequestContext.anonymous({
				requestId: 'schema-mutation-hook-cancel',
				signal: controller.signal,
				source: requestSources.internal,
			})
			await expect(
				parts.execute(ultimabase, { context }),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(trace).toStrictEqual([
				'begin',
				'prepare:delete-one',
				'handler',
				'hook:cancel',
				'rollback',
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('validates stale branches and keeps the Hooks engine optional', async () => {
		const staleTrace: string[] = []
		const stale = createArchiveParts(staleTrace, {
			beforeOperation: { stale: () => undefined },
		})
		const staleApp = new (UltimaBase.use(
			hooksPlugin(),
			stale.owner,
			stale.database,
		))({
			logger: false,
			schemas: [stale.Document],
		})
		onTestFinished(() => staleApp.dispose())
		await expect(staleApp.start()).rejects.toThrow(
			'Unknown schema mutation Hook branch',
		)
		expect(staleTrace).toStrictEqual([])

		const trace: string[] = []
		const noEngine = createArchiveParts(trace)
		const noEngineApp = new (UltimaBase.use(noEngine.owner, noEngine.database))(
			{ logger: false, schemas: [noEngine.Document] },
		)
		onTestFinished(() => noEngineApp.dispose())
		try {
			await noEngineApp.start()
			await expect(noEngine.execute(noEngineApp)).resolves.toMatchObject({
				workflowState: 'archived',
			})
			expect(trace).toContain('commit')
		} finally {
			await noEngineApp.dispose()
		}
	})

	it('isolates exact mutation callbacks across sequential applications', async () => {
		const firstTrace: string[] = []
		const secondTrace: string[] = []
		const firstHook = vi.fn()
		const secondHook = vi.fn()
		const first = createArchiveParts(firstTrace, {
			beforeOperation: { archive: firstHook },
		})
		const second = createArchiveParts(secondTrace, {
			beforeOperation: { archive: secondHook },
		})
		const firstApp = new (UltimaBase.use(
			hooksPlugin(),
			first.owner,
			first.database,
		))({
			logger: false,
			schemas: [first.Document],
		})
		onTestFinished(() => firstApp.dispose())
		const secondApp = new (UltimaBase.use(
			hooksPlugin(),
			second.owner,
			second.database,
		))({
			logger: false,
			schemas: [second.Document],
		})
		onTestFinished(() => secondApp.dispose())

		try {
			await firstApp.start()
			await first.execute(firstApp)
			await firstApp.dispose()
			await secondApp.start()
			await second.execute(secondApp)
			expect(firstHook).toHaveBeenCalledOnce()
			expect(secondHook).toHaveBeenCalledOnce()
			expect(firstTrace.filter((entry) => entry === 'handler')).toHaveLength(1)
			expect(secondTrace.filter((entry) => entry === 'handler')).toHaveLength(1)
		} finally {
			await Promise.all([firstApp.dispose(), secondApp.dispose()])
		}
	})

	it('runs request mutations under audited Master without bypassing Hooks', async () => {
		const trace: string[] = []
		const hook = vi.fn((input: RuntimeMutationHookInput) => {
			trace.push(`hook:${input.context.access.mode}`)
		})
		const parts = createArchiveParts(trace, {
			beforeOperation: { archive: hook },
		})
		const audit = vi.fn()
		const ultimabase = new (UltimaBase.use(
			hooksPlugin(),
			parts.owner,
			parts.database,
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'schema-mutation-hooks-master', value: 'unused' }],
				onUse: audit,
			}),
			logger: false,
			schemas: [parts.Document],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await parts.execute(ultimabase, { useMasterKey: true })
			expect(hook).toHaveBeenCalledOnce()
			expect(trace).toContain('hook:master')
			expect(audit).toHaveBeenCalledOnce()
		} finally {
			await ultimabase.dispose()
		}
	})
})
