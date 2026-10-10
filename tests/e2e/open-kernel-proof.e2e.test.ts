import path from 'node:path'

import {
	FrameworkError,
	UltimaBase,
	databaseAdapterCapability,
	plugin,
	getPluginFieldStorageCodec,
	provideCapability,
	type PluginPrivilege,
} from '@ultimabase/core'
import { RequestContext } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	FakePublicOperationTransport,
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { generateApplicationTypes } from '@ultimabase/typegen'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createSoftDeletePlugin } from './fixtures/open-kernel-soft-delete.js'
import { createValuePlugin } from './fixtures/open-kernel-value.js'
import {
	createWorkflowPlugin,
	inspectWorkflow,
	workflowFakeTransport,
} from './fixtures/open-kernel-workflow.js'

const transaction = {
	commit: () => Promise.resolve(),
	execute: () =>
		Promise.reject(new Error('Unexpected fixture database execution')),
	kind: 'database-transaction-adapter' as const,
	prepare: () =>
		Promise.reject(new Error('Unexpected fixture database preparation')),
	rollback: () => Promise.resolve(),
}
const database = {
	beginTransaction: () => Promise.resolve(transaction),
	execute: () =>
		Promise.reject(new Error('Unexpected fixture database execution')),
	kind: 'database-adapter' as const,
	checkHealth: (): Promise<void> => Promise.resolve(),
}
const createKernelSupportPlugin = () =>
	plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: database }),
			}),
		],
		core: '^0.0.0',
		id: 'fixture.open-kernel-support',
		version: '1.0.0',
	})

const createWorkflowFixture = () => {
	const Stable = UltimaBase.Schema.define({
		className: 'OpenKernelWorkflowPost',
		fields: (field) => ({ title: field.string() }),
	})
	const workflow = createWorkflowPlugin({
		instanceId: 'editorial',
		stableSchema: Stable,
	})
	return { Stable, workflow }
}

describe('open-kernel workflow proof', () => {
	it('passes the public conformance harness and executes application and transport boundaries', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () => {
				const { Stable, workflow } = createWorkflowFixture()
				return createPluginConformanceFixture({
					schemas: [Stable],
					subject: workflow.plugin,
					supportPlugins: [hooksPlugin(), createKernelSupportPlugin()],
				})
			},
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.open-kernel-workflow',
				privileges: [
					'schema:declare',
					'operation:declare',
					'runtime:observe',
					'runtime:intercept',
					'transport:expose',
					'typegen:reference',
				],
				version: '1.0.0',
			},
		})
			.check('operation', async ({ createUltimaBase }) => {
				const fixture = createUltimaBase()
				await fixture.ultimabase.start()
				await expect(
					fixture.ultimabase
						.operation(inspectWorkflow)
						.execute({ reason: 'inspect' }),
				).resolves.toStrictEqual({
					schema: 'application',
					state: 'application',
				})
			})
			.check('schema-surface', ({ createUltimaBase }) => {
				const { ultimabase } = createUltimaBase()
				const application = ultimabase.compile()
				expect(
					application.schemas.values().map(({ className }) => className),
				).toStrictEqual(['OpenKernelWorkflowPost', 'WorkflowAuditeditorial'])
				expect(application.typegenGraph.schemaSurfaces).toHaveLength(2)
			})
			.check('transport', async ({ createUltimaBase }) => {
				const { ultimabase } = createUltimaBase()
				await ultimabase.start()
				const request = {
					context: RequestContext.anonymous({
						requestId: 'open-kernel-transport',
						source: 'fixture',
					}),
					input: { reason: 'wire' },
					operation: inspectWorkflow.name,
					version: inspectWorkflow.version,
				}
				expect(() =>
					ultimabase.exposeOperations({
						operations: [],
						transport: workflowFakeTransport,
					}),
				).toThrow('non-empty operation list')
				const exposed = new FakePublicOperationTransport(
					ultimabase.exposeOperations({
						acknowledgeUnverifiedProtection: true,
						operations: [inspectWorkflow],
						transport: workflowFakeTransport,
					}),
				)
				expect(await exposed.request(request)).toStrictEqual({
					ok: true,
					result: { schema: 'application', state: 'application' },
				})
			})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'open-kernel-workflow',
				verify: ({ contents }) => {
					expect(contents).toContain('WorkflowTransitionInput')
					expect(contents).toContain('WorkflowAuditeditorial')
				},
			}),
		)
		expect(report.checks.map(({ contract }) => contract)).toEqual(
			expect.arrayContaining([
				'operation',
				'schema-surface',
				'transport',
				'typegen',
			]),
		)
	}, 20_000)

	it('denies every active power before it can bind the reusable schema', () => {
		const privileges: readonly PluginPrivilege[] = [
			'schema:declare',
			'operation:declare',
			'transport:expose',
			'runtime:intercept',
			'runtime:observe',
			'typegen:reference',
		]
		for (const privilege of privileges) {
			const { Stable, workflow } = createWorkflowFixture()
			const Application = UltimaBase.use(hooksPlugin())
				.use(createKernelSupportPlugin())
				.use(workflow.plugin)
			expect(
				() =>
					new Application({
						pluginPrivileges: { deny: [privilege] },
						logger: false,
						schemas: [Stable],
					}),
			).toThrow(FrameworkError)
			const allowed = new UltimaBase({ schemas: [Stable] })
			expect(() => allowed.compile()).not.toThrow()
		}
	})

	it('isolates different graphs and rejects incompatible reuse clearly', async () => {
		const first = createWorkflowFixture()
		const second = createWorkflowFixture()
		const firstApp = new (UltimaBase.use(hooksPlugin()).use(
			first.workflow.plugin,
		))({
			schemas: [first.Stable],
		})
		const secondApp = new (UltimaBase.use(hooksPlugin()).use(
			second.workflow.plugin,
		))({
			schemas: [second.Stable],
		})
		expect(firstApp.schema(first.workflow.DynamicAudit).schema).toBe(
			first.workflow.DynamicAudit,
		)
		expect(() => firstApp.schema(second.workflow.DynamicAudit)).toThrow(
			'does not belong to this application',
		)
		expect(secondApp.schema(second.workflow.DynamicAudit).schema).toBe(
			second.workflow.DynamicAudit,
		)
		await Promise.all([firstApp.dispose(), secondApp.dispose()])

		const Shared = UltimaBase.Schema.define({
			className: 'OpenKernelIncompatibleShared',
			fields: (field) => ({ title: field.string() }),
		})
		const base = new UltimaBase({ schemas: [Shared] })
		base.compile()
		const changed = createWorkflowPlugin({
			instanceId: 'changed',
			stableSchema: Shared,
		})
		expect(() =>
			new (UltimaBase.use(hooksPlugin()).use(changed.plugin))({
				schemas: [Shared],
			}).compile(),
		).toThrow(/incompatible|another application/iu)
		await base.dispose()
	})
})

describe('open-kernel Typegen proof', () => {
	it('runs the value and soft-delete fixtures through public conformance', async () => {
		const createValueFixture = () => {
			const value = createValuePlugin({
				instanceId: 'main',
				targetClassName: 'OpenKernelConformanceLedger',
			})
			const Ledger = UltimaBase.use(value).Schema.define({
				className: 'OpenKernelConformanceLedger',
				decimalLedger: { defaultScale: 2 },
				fields: (field) => ({
					label: field.string({
						decimalLabel: { format: 'plain' },
					}),
				}),
			})
			return { Ledger, plugin: value }
		}
		const valueSuite = definePluginConformanceSuite({
			createFixture: () => {
				const { Ledger, plugin } = createValueFixture()
				return createPluginConformanceFixture({
					schemas: [Ledger],
					subject: plugin,
					supportPlugins: [createKernelSupportPlugin()],
				})
			},
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.open-kernel-value',
				privileges: ['schema:declare', 'typegen:reference'],
				version: '1.0.0',
			},
		}).check('codec', ({ createUltimaBase }) => {
			const { ultimabase } = createUltimaBase()
			const application = ultimabase.compile()
			const schema = application.schemas.get('OpenKernelConformanceLedger')
			if (schema === undefined)
				throw new TypeError('Missing decimal fixture schema')
			const field = schema.definition.fields.amount
			if (field === undefined)
				throw new TypeError('Missing decimal fixture field')
			const label = schema.definition.fields.label
			if (label === undefined)
				throw new TypeError('Missing decimal fixture label field')
			expect(Reflect.get(schema.definition, 'decimalLedger')).toStrictEqual({
				defaultScale: 2,
			})
			expect(Reflect.get(label.options, 'decimalLabel')).toStrictEqual({
				format: 'plain',
			})
			const codec = getPluginFieldStorageCodec(field)
			expect(
				codec?.decode(codec.encode({ scale: 3, units: '1200' })),
			).toStrictEqual({
				scale: 3,
				units: '1200',
			})
		})
		const valueReport = await runPluginConformance(
			withPluginTypegenConformance(valueSuite, {
				applicationId: 'open-kernel-value',
				verify: ({ contents }) => {
					expect(contents).toContain('readonly amount: Plugin0_DecimalValue')
					expect(contents).toContain('readonly decimalLabel?:')
					expect(contents).toContain('readonly decimalLedger?:')
					expect(contents).toContain(
						'readonly amount?: PortableEqualityFilter<Plugin0_DecimalValue>',
					)
				},
			}),
		)
		expect(valueReport.checks).toContainEqual({
			contract: 'codec',
			status: 'passed',
		})

		const createSoftFixture = () => {
			const Post = UltimaBase.Schema.define({
				className: 'OpenKernelConformanceSoftPost',
				fields: (field) => ({ title: field.string() }),
			})
			return {
				Post,
				plugin: createSoftDeletePlugin({ instanceId: 'main', target: Post }),
			}
		}
		const softSuite = definePluginConformanceSuite({
			createFixture: () => {
				const { Post, plugin } = createSoftFixture()
				return createPluginConformanceFixture({
					schemas: [Post],
					subject: plugin,
					supportPlugins: [createKernelSupportPlugin()],
				})
			},
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.open-kernel-soft-delete',
				privileges: [
					'schema:declare',
					'runtime:constrain',
					'persistence:rewrite',
				],
				version: '1.0.0',
			},
		}).check('persistence', ({ createUltimaBase }) => {
			const { ultimabase } = createUltimaBase()
			const application = ultimabase.compile()
			const schema = application.schemas.get('OpenKernelConformanceSoftPost')
			if (schema === undefined)
				throw new TypeError('Missing soft-delete fixture schema')
			expect(schema.definition.fields).toHaveProperty('isDeleted')
			expect(application.typegenGraph.operations).toStrictEqual([])
		})
		const softReport = await runPluginConformance(softSuite)
		expect(softReport.checks).toContainEqual({
			contract: 'persistence',
			status: 'passed',
		})
	}, 20_000)

	it('keeps exact generated types valid through built public exports', () => {
		const { Stable, workflow } = createWorkflowFixture()
		const value = createValuePlugin({
			instanceId: 'typed',
			targetClassName: 'OpenKernelLanguageServiceLedger',
		})
		const Ledger = UltimaBase.use(value).Schema.define({
			className: 'OpenKernelLanguageServiceLedger',
			decimalLedger: { defaultScale: 4 },
			fields: (field) => ({
				label: field.string({
					decimalLabel: { format: 'accounting' },
				}),
			}),
		})
		const Application = UltimaBase.use(hooksPlugin())
			.use(createKernelSupportPlugin())
			.use(workflow.plugin)
			.use(value)
		const application = new Application({
			schemas: [Stable, Ledger],
		})
		const generated = generateApplicationTypes({
			ultimabase: application,
			applicationId: 'open-kernel-language-service',
		}).contents
		const repository = path.resolve(import.meta.dirname, '../..')
		const fileName = path.join(
			import.meta.dirname,
			'open-kernel-language-service.fixture.ts',
		)
		const source = `${generated}
import { UltimaBase } from '@ultimabase/core'
import { createValuePlugin } from './fixtures/open-kernel-value.js'
const app = undefined as unknown as Core.UltimaBase<readonly []>
const operation = app.operation('fixture.workflow.inspect')
operation.prepare({ reason: 'typed' })
const result: Promise<Plugin0_WorkflowTransitionResult> = operation.execute({ reason: 'typed' })
const valuePlugin = createValuePlugin({ instanceId: 'typed', targetClassName: 'OpenKernelLanguageServiceLedger' })
const ConfiguredLedger = UltimaBase.use(valuePlugin).Schema.define({
  className: 'OpenKernelLanguageServiceLedger',
  decimalLedger: { defaultScale: 4 },
  fields: (field) => ({ label: field.string({ decimalLabel: { format: 'accounting' } }) }),
})
ConfiguredLedger.findMany({ where: { amount: { eq: { scale: 2, units: '100' } } } })
// @ts-expect-error -- Generated portable equality retains the exact logical value.
ConfiguredLedger.findMany({ where: { amount: { eq: { scale: '2', units: '100' } } } })
const validWhere: OpenKernelLanguageServiceLedgerWhereInput = { amount: { eq: { scale: 2, units: '100' }, notIn: [{ scale: 0, units: '0' }] } }
// @ts-expect-error -- Portable equality retains the plugin's exact logical value.
const invalidWhere: OpenKernelLanguageServiceLedgerWhereInput = { amount: { eq: { scale: '2', units: '100' } } }
void result
void validWhere
void invalidWhere
`
		const host: ts.LanguageServiceHost = {
			fileExists: (requested) => ts.sys.fileExists(requested),
			getCompilationSettings: () => ({
				baseUrl: repository,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				paths: {
					'@fixture/open-kernel': ['tests/e2e/fixtures/open-kernel-types.ts'],
					'@ultimabase/core': ['packages/core/dist/index.d.ts'],
					'@ultimabase/shared': ['packages/shared/dist/index.d.ts'],
				},
				strict: true,
				target: ts.ScriptTarget.ESNext,
			}),
			getCurrentDirectory: () => repository,
			getDefaultLibFileName: ts.getDefaultLibFilePath,
			getScriptFileNames: () => [fileName],
			getScriptSnapshot: (requested) => {
				const value =
					requested === fileName ? source : ts.sys.readFile(requested)
				return value === undefined
					? undefined
					: ts.ScriptSnapshot.fromString(value)
			},
			getScriptVersion: () => '0',
			readFile: (requested) => ts.sys.readFile(requested),
		}
		const diagnostics = ts
			.createLanguageService(host)
			.getSemanticDiagnostics(fileName)
		expect(diagnostics).toStrictEqual([])
	})
})
