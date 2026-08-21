import path from 'node:path'
import { readFile } from 'node:fs/promises'

import {
	FrameworkApplication,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationResult,
	typegenEmitterCapability,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { generateApplicationTypes } from '@ultimabase/typegen'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	alternativeBehavior,
	alternativeBehaviorPluginId,
	createAlternativeBehaviorDiagnosticObserver,
	createAlternativeBehaviorEngine,
	createSharedRuntimeMiddleware,
} from './fixtures/alternative-behavior-engine.js'
import { createWorkflowPlugin } from './fixtures/open-kernel-workflow.js'

const alternativeFixturePath = path.join(
	import.meta.dirname,
	'fixtures/alternative-behavior-engine.ts',
)
const javascriptFixturePath = path.join(
	import.meta.dirname,
	'fixtures/no-hooks-postgres.mjs',
)

class EmptyReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	beginTransaction(): Promise<never> {
		return Promise.reject(new Error('Unexpected fixture transaction'))
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		return Promise.resolve([] as unknown as DatabaseOperationResult<TOperation>)
	}
}

const createBehaviorSupportPlugin = () =>
	definePlugin({
		pluginId: 'fixture.alternative-behavior-support',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'empty-database',
					create: () => ({ value: new EmptyReadAdapter() }),
				}),
				provideCapability(typegenEmitterCapability, {
					contributionId: 'typegen',
					value: { kind: 'typegen-emitter' },
				}),
			],
		},
	})

const createAlternativeFixture = () => {
	const Post = Schema.define({
		className: 'AlternativeBehaviorPost',
		alternativeBehavior: alternativeBehavior({ label: 'editorial' }),
		fields: (field) => ({
			title: field.string({ validation: { required: true } }),
		}),
	})
	const engine = createAlternativeBehaviorEngine({ instanceId: 'typed' })
	const observer = createAlternativeBehaviorDiagnosticObserver(() => undefined)

	return { engine, observer, Post }
}

describe('optional Hooks engine proof', () => {
	it('keeps no-Hooks inspection and generated contracts free of official vocabulary', async () => {
		const Plain = Schema.define({
			className: 'NoHooksGeneratedPost',
			fields: (field) => ({ title: field.string() }),
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [Plain],
		})

		try {
			const generated = generateApplicationTypes({
				application,
				applicationId: 'no-hooks-proof',
			})

			expect(application.pluginPrivilegeReport.plugins).toStrictEqual([])
			expect(application.typegenGraph.options).toStrictEqual([])
			expect(generated.contents).not.toContain('@ultimabase/hooks-plugin')
			expect(generated.contents).not.toContain('SchemaHooksOption')
			expect(generated.contents).not.toContain('FieldHooksOption')
			const [alternativeSource, javascriptSource] = await Promise.all([
				readFile(alternativeFixturePath, 'utf8'),
				readFile(javascriptFixturePath, 'utf8'),
			])
			expect(alternativeSource).not.toContain('@ultimabase/hooks-plugin')
			expect(javascriptSource).not.toContain('@ultimabase/hooks-plugin')
		} finally {
			await application.dispose()
		}
	})

	it('runs the independent engine through conformance, middleware, and Typegen', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () => {
				const { engine, observer, Post } = createAlternativeFixture()
				return createPluginConformanceFixture({
					schemas: [Post],
					subject: engine.plugin,
					supportPlugins: [observer, createBehaviorSupportPlugin()],
				})
			},
			expected: {
				core: '^0.0.0',
				pluginId: alternativeBehaviorPluginId,
				privileges: [
					'schema:declare',
					'runtime:intercept',
					'event:publish',
					'typegen:contribute',
				],
				version: '1.0.0',
			},
		}).check('middleware', async ({ createUltimaBase }) => {
			const { ultimabase, schemas } = createUltimaBase()
			await ultimabase.start()
			await schemas[0].findMany(undefined, { ultimabase })
			expect(
				ultimabase.application
					.getPlugin(alternativeBehaviorPluginId)
					.diagnostics(),
			).toStrictEqual([
				{
					operation: 'find-many',
					phase: 'result',
					schema: 'AlternativeBehaviorPost',
				},
			])
		})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'alternative-behavior-conformance',
				verify: ({ contents }) => {
					expect(contents).toContain('AlternativeBehaviorDiagnostic')
					expect(contents).toContain('AlternativeBehaviorAudittyped')
					expect(contents).not.toContain('@ultimabase/hooks-plugin')
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toEqual(
			expect.arrayContaining([
				'application-isolation',
				'lifecycle-cleanup',
				'middleware',
				'typegen',
			]),
		)
	}, 20_000)

	it('keeps alternative Runtime state isolated and disposes each application', async () => {
		const disposed: string[] = []
		const Post = Schema.define({
			className: 'AlternativeBehaviorIsolationPost',
			alternativeBehavior: alternativeBehavior({ label: 'isolated' }),
			fields: (field) => ({ title: field.string() }),
		})
		const engine = createAlternativeBehaviorEngine({
			onDispose: () => disposed.push('disposed'),
		})
		const database = createBehaviorSupportPlugin()
		const first = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, engine.plugin],
			schemas: [Post],
		})
		const second = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, engine.plugin],
			schemas: [Post],
		})

		try {
			await Promise.all([first.start(), second.start()])
			await Post.findMany(undefined, { ultimabase: first })
			expect(
				first.application.getPlugin(alternativeBehaviorPluginId).diagnostics(),
			).toHaveLength(1)
			expect(
				second.application.getPlugin(alternativeBehaviorPluginId).diagnostics(),
			).toStrictEqual([])
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}

		expect(disposed).toStrictEqual(['disposed', 'disposed'])
	})

	it('separates official-compatible providers from independent alternatives', async () => {
		const OfficialPost = Schema.define({
			className: 'OfficialCompatiblePost',
			fields: (field) => ({ title: field.string() }),
		})
		const workflow = createWorkflowPlugin({
			instanceId: 'official',
			stableSchema: OfficialPost,
		})
		expect(
			() =>
				new FrameworkApplication({
					plugins: [workflow.plugin],
					schemas: [OfficialPost],
				}),
		).toThrow(/requires missing plugin.*@ultimabase\/hooks-plugin/iu)

		const official = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [hooksPlugin(), workflow.plugin],
			schemas: [OfficialPost],
		})
		const independent = createAlternativeFixture()
		const alternative = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [independent.engine.plugin],
			schemas: [independent.Post],
		})

		try {
			expect(() => official.compileSchemas()).not.toThrow()
			expect(() => alternative.compileSchemas()).not.toThrow()
			expect('peers' in independent.engine.plugin).toBe(false)
		} finally {
			await Promise.all([official.dispose(), alternative.dispose()])
		}
	})

	it('keeps generated alternative contracts valid through compiled exports', () => {
		const { engine, observer, Post } = createAlternativeFixture()
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [observer, createBehaviorSupportPlugin(), engine.plugin],
			schemas: [Post],
		})
		const generated = generateApplicationTypes({
			application,
			applicationId: 'alternative-behavior-language-service',
		}).contents
		const repository = path.resolve(import.meta.dirname, '../..')
		const fileName = path.join(
			import.meta.dirname,
			'alternative-behavior-language-service.fixture.ts',
		)
		const source = `import type {} from '@ultimabase/core'\n${generated}\nconst valid: AlternativeBehaviorAudittypedCreateInput = { action: 'create-one', label: 'editorial', schema: 'Post' }\n// @ts-expect-error -- The generated audit contract keeps exact field values.\nconst invalid: AlternativeBehaviorAudittypedCreateInput = { action: 1, label: 'editorial', schema: 'Post' }\nvoid valid\nvoid invalid\n`
		const host: ts.LanguageServiceHost = {
			fileExists: (requested) => ts.sys.fileExists(requested),
			getCompilationSettings: () => ({
				baseUrl: repository,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				paths: {
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

		expect(
			ts.createLanguageService(host).getSemanticDiagnostics(fileName),
		).toStrictEqual([])
	})

	it('composes shared low-level middleware without either lifecycle engine', async () => {
		const trace: string[] = []
		const Plain = Schema.define({
			className: 'SharedMiddlewareNoHooksPost',
			fields: (field) => ({ title: field.string() }),
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				createBehaviorSupportPlugin(),
				createSharedRuntimeMiddleware((schema) => trace.push(schema)),
			],
			schemas: [Plain],
		})

		try {
			await ultimabase.start()
			await Plain.findMany(undefined, { ultimabase })
			expect(trace).toStrictEqual(['SharedMiddlewareNoHooksPost'])
			expect(
				ultimabase.application.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/hooks-plugin')
		} finally {
			await ultimabase.dispose()
		}
	})
})
