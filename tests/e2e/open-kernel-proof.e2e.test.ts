import path from 'node:path'

import {
	FrameworkApplication,
	FrameworkError,
	RequestContext,
	Schema,
	UltimaBase,
	adapterPersistencePlanCapability,
	adapterValueStorageCapability,
	databaseAdapterCapability,
	definePlugin,
	getPluginFieldStorageCodec,
	provideAdapterCapability,
	provideCapability,
	type PluginPrivilege,
	typegenEmitterCapability,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	FakeAdapterMigrationHistory,
	FakePublicOperationTransport,
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { generateApplicationTypes } from '@ultimabase/typegen'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createValuePostgresPlugin } from './fixtures/open-kernel-postgres.js'
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
}
const createKernelSupportPlugin = () =>
	definePlugin({
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database',
					create: () => ({ value: database }),
				}),
				provideAdapterCapability(adapterValueStorageCapability, {
					contributionId: 'json-storage',
					value: {
						adapterId: 'fixture.open-kernel-adapter',
						family: 'value-storage',
						formats: ['json'],
					},
				}),
				provideAdapterCapability(adapterPersistencePlanCapability, {
					contributionId: 'persistence-plans',
					value: {
						adapterId: 'fixture.open-kernel-adapter',
						family: 'persistence-plan',
						kinds: ['update-one', 'delete-one'],
						protocolVersion: 1,
					},
				}),
				provideCapability(typegenEmitterCapability, {
					contributionId: 'typegen',
					value: { kind: 'typegen-emitter' },
				}),
			],
		},
		core: '^0.0.0',
		pluginId: 'fixture.open-kernel-support',
		version: '1.0.0',
	})

const createWorkflowFixture = () => {
	const Stable = Schema.define({
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
	it('passes the public conformance harness and executes every handle boundary', async () => {
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
					'model:extend',
					'operation:declare',
					'transport:expose',
					'runtime:intercept',
					'runtime:observe',
					'typegen:reference',
					'typegen:contribute',
				],
				version: '1.0.0',
			},
		})
			.check('operation', async ({ createUltimaBase }) => {
				const fixture = createUltimaBase()
				await fixture.ultimabase.start()
				const stable = fixture.ultimabase.schema(fixture.schemas[0])
				const dynamic = fixture.ultimabase.schema('WorkflowAuditeditorial')
				await expect(
					fixture.ultimabase
						.operation(inspectWorkflow)
						.execute({ reason: 'inspect' }),
				).resolves.toStrictEqual({
					schema: 'application',
					state: 'application',
				})
				await expect(
					stable.command('publish').execute({ reason: 'stable' }),
				).resolves.toStrictEqual({
					schema: 'OpenKernelWorkflowPost',
					state: 'schema',
				})
				await expect(
					dynamic.command('publish').execute({ reason: 'dynamic' }),
				).resolves.toStrictEqual({
					schema: 'WorkflowAuditeditorial',
					state: 'schema',
				})
				await expect(
					stable
						.for(new fixture.schemas[0]({ title: 'Draft' }))
						.command('publish')
						.execute({ reason: 'model' }),
				).resolves.toStrictEqual({
					schema: 'OpenKernelWorkflowPost',
					state: 'draft',
				})
			})
			.check('schema-surface', ({ createApplication }) => {
				const { application } = createApplication()
				application.compileSchemas()
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
					expect(contents).toContain('WorkflowHistoryEntry')
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
			'model:extend',
			'operation:declare',
			'transport:expose',
			'runtime:intercept',
			'runtime:observe',
			'typegen:reference',
			'typegen:contribute',
		]
		for (const privilege of privileges) {
			const { Stable, workflow } = createWorkflowFixture()
			expect(
				() =>
					new FrameworkApplication({
						pluginPrivileges: { deny: [privilege], logger: false },
						plugins: [
							hooksPlugin(),
							createKernelSupportPlugin(),
							workflow.plugin,
						],
						schemas: [Stable],
					}),
			).toThrow(FrameworkError)
			const allowed = new FrameworkApplication({
				plugins: [],
				schemas: [Stable],
			})
			expect(() => allowed.compileSchemas()).not.toThrow()
		}
	})

	it('isolates different graphs and rejects incompatible reuse clearly', async () => {
		const first = createWorkflowFixture()
		const second = createWorkflowFixture()
		const firstApp = new UltimaBase({
			plugins: [hooksPlugin(), first.workflow.plugin],
			schemas: [first.Stable],
		})
		const secondApp = new UltimaBase({
			plugins: [hooksPlugin(), second.workflow.plugin],
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

		const Shared = Schema.define({
			className: 'OpenKernelIncompatibleShared',
			fields: (field) => ({ title: field.string() }),
		})
		const base = new FrameworkApplication({ plugins: [], schemas: [Shared] })
		base.compileSchemas()
		const changed = createWorkflowPlugin({
			instanceId: 'changed',
			stableSchema: Shared,
		})
		expect(() =>
			new FrameworkApplication({
				plugins: [hooksPlugin(), changed.plugin],
				schemas: [Shared],
			}).compileSchemas(),
		).toThrow(/incompatible|another application/iu)
		await base.dispose()
	})
})

describe('open-kernel Typegen and migration proof', () => {
	it('runs the value and soft-delete fixtures through public conformance', async () => {
		const createValueFixture = () => {
			const Ledger = Schema.define({
				className: 'OpenKernelConformanceLedger',
				fields: (field) => ({ label: field.string() }),
			})
			return {
				Ledger,
				plugin: createValuePlugin({ instanceId: 'main', target: Ledger }),
			}
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
				privileges: ['adapter:consume', 'schema:declare', 'typegen:reference'],
				version: '1.0.0',
			},
		}).check('codec', ({ createApplication }) => {
			const { application } = createApplication()
			application.compileSchemas()
			const schema = application.schemas.get('OpenKernelConformanceLedger')
			const field = schema?.definition.fields.amount
			if (field === undefined)
				throw new TypeError('Missing decimal fixture field')
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
			const Post = Schema.define({
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
					'adapter:consume',
					'schema:declare',
					'runtime:constrain',
					'persistence:rewrite',
				],
				version: '1.0.0',
			},
		}).check('persistence', ({ createApplication }) => {
			const { application } = createApplication()
			application.compileSchemas()
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
		const Ledger = Schema.define({
			className: 'OpenKernelLanguageServiceLedger',
			fields: (field) => ({ label: field.string() }),
		})
		const value = createValuePlugin({ instanceId: 'typed', target: Ledger })
		const application = new FrameworkApplication({
			plugins: [
				hooksPlugin(),
				createKernelSupportPlugin(),
				workflow.plugin,
				value,
			],
			schemas: [Stable, Ledger],
		})
		const generated = generateApplicationTypes({
			application,
			applicationId: 'open-kernel-language-service',
		}).contents
		const repository = path.resolve(import.meta.dirname, '../..')
		const fileName = path.join(
			import.meta.dirname,
			'open-kernel-language-service.fixture.ts',
		)
		const source = `${generated}\nconst app = undefined as unknown as Core.UltimaBase<readonly [], readonly []>\nconst audit = app.schema('WorkflowAuditeditorial')\naudit.publish.prepare({ reason: 'typed' })\nconst result: Promise<Plugin0_WorkflowTransitionResult> = audit.publish.execute({ reason: 'typed' })\nconst validWhere: OpenKernelLanguageServiceLedgerWhereInput = { amount: { eq: { scale: 2, units: '100' }, notIn: [{ scale: 0, units: '0' }] } }\n// @ts-expect-error -- Portable equality retains the plugin's exact logical value.\nconst invalidWhere: OpenKernelLanguageServiceLedgerWhereInput = { amount: { eq: { scale: '2', units: '100' } } }\nvoid result\nvoid validWhere\nvoid invalidWhere\n`
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

	it('retains two instances, one upgrade, and one orphan without destruction', async () => {
		const First = Schema.define({
			className: 'OpenKernelMigrationFirst',
			postgres: { table: 'open_kernel_migration_first' },
			fields: (field) => ({ title: field.string() }),
		})
		const Second = Schema.define({
			className: 'OpenKernelMigrationSecond',
			postgres: { table: 'open_kernel_migration_second' },
			fields: (field) => ({ title: field.string() }),
		})
		const createMetadata = async (version: '1.0.0' | '2.0.0') => {
			const first = createValuePostgresPlugin({
				includeUpgrade: version === '2.0.0',
				instanceId: 'first',
				table: 'open_kernel_migration_first',
				version,
			})
			const second = createValuePostgresPlugin({
				instanceId: 'second',
				table: 'open_kernel_migration_second',
				version: '1.0.0',
			})
			const application = new FrameworkApplication({
				plugins: [
					postgresPlugin({ url: 'postgresql://fixture.invalid/proof' }),
					first,
					second,
				],
				schemas: [First, Second],
			})
			await application.initialize()
			const metadata = application.getPlugin(
				'@ultimabase/postgres-plugin',
			).adapterMetadata
			await application.dispose()
			return metadata
		}
		const previous = await createMetadata('1.0.0')
		const current = await createMetadata('2.0.0')
		expect(
			previous.physicalSchema.map(({ instanceId }) => instanceId),
		).toStrictEqual(['first', 'second'])
		const history = new FakeAdapterMigrationHistory(previous.physicalSchema)
		const plan = history.plan(
			current.physicalSchema.filter(({ instanceId }) => instanceId === 'first'),
			current.migrations,
		)
		expect({
			orphaned: plan.orphaned.map(({ previous: value }) => value.instanceId),
			upgrades: plan.upgrades.map(({ current: value, intent }) => ({
				contributionId: value.contributionId,
				instanceId: value.instanceId,
				intent: intent.payload,
			})),
		}).toMatchInlineSnapshot(`
			{
			  "orphaned": [
			    "second",
			  ],
			  "upgrades": [
			    {
			      "contributionId": "decimal-sort-key",
			      "instanceId": "first",
			      "intent": {
			        "from": "^1.0.0",
			        "intent": {
			          "strategy": "recompute-decimal-sort-key",
			        },
			        "kind": "upgrade",
			        "target": {
			          "contributionId": "decimal-sort-key",
			          "instanceId": "first",
			          "pluginId": "fixture.open-kernel-value-postgres",
			        },
			        "to": "2.0.0",
			      },
			    },
			  ],
			}
		`)
	})
})
