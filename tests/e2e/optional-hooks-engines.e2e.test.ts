import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationResult,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
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
	readonly checkHealth = (): Promise<void> => Promise.resolve()
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
	plugin({
		id: 'fixture.alternative-behavior-support',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'empty-database',
				create: () => ({ value: new EmptyReadAdapter() }),
			}),
		],
	})

const createAlternativeFixture = () => {
	const engine = createAlternativeBehaviorEngine({ instanceId: 'typed' })
	const Post = UltimaBase.use(engine.plugin)
		.Schema.define({
			className: 'AlternativeBehaviorPost',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
		})
		.with({ alternativeBehavior: alternativeBehavior({ label: 'editorial' }) })
	const observer = createAlternativeBehaviorDiagnosticObserver(() => undefined)

	return { engine, observer, Post }
}

describe('optional Hooks engine proof', () => {
	it('keeps no-Hooks inspection free of official vocabulary', async () => {
		const Plain = UltimaBase.Schema.define({
			className: 'NoHooksGeneratedPost',
			fields: (field) => ({ title: field.string() }),
		})
		const application = new UltimaBase({
			logger: false,
			schemas: [Plain],
		})

		try {
			expect(application.pluginPrivilegeReport.plugins).toStrictEqual([])
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

	it('runs the independent engine through conformance and middleware', async () => {
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
				privileges: ['schema:declare', 'runtime:intercept', 'event:publish'],
				version: '1.0.0',
			},
		}).check('middleware', async ({ createUltimaBase }) => {
			const { ultimabase, schemas } = createUltimaBase()
			await ultimabase.start()
			await schemas[0].findMany(undefined)
			expect(
				ultimabase.plugin(alternativeBehaviorPluginId).diagnostics(),
			).toStrictEqual([
				{
					operation: 'find-many',
					phase: 'result',
					schema: 'AlternativeBehaviorPost',
				},
			])
		})
		const report = await runPluginConformance(suite)

		expect(report.checks.map(({ contract }) => contract)).toEqual(
			expect.arrayContaining([
				'application-isolation',
				'lifecycle-cleanup',
				'middleware',
			]),
		)
	}, 20_000)

	it('keeps alternative Runtime state isolated and disposes each application', async () => {
		const disposed: string[] = []
		const engine = createAlternativeBehaviorEngine({
			onDispose: () => disposed.push('disposed'),
		})
		const Post = UltimaBase.use(engine.plugin)
			.Schema.define({
				className: 'AlternativeBehaviorIsolationPost',
				fields: (field) => ({ title: field.string() }),
			})
			.with({ alternativeBehavior: alternativeBehavior({ label: 'isolated' }) })
		const database = createBehaviorSupportPlugin()
		const first = new (UltimaBase.use(database, engine.plugin))({
			logger: false,
			schemas: [Post],
		})
		const second = new (UltimaBase.use(database, engine.plugin))({
			logger: false,
			schemas: [Post],
		})

		try {
			await first.start()
			await Post.findMany(undefined)
			expect(
				first.plugin(alternativeBehaviorPluginId).diagnostics(),
			).toHaveLength(1)
			await first.dispose()
			await second.start()
			expect(
				second.plugin(alternativeBehaviorPluginId).diagnostics(),
			).toStrictEqual([])
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}

		expect(disposed).toStrictEqual(['disposed', 'disposed'])
	})

	it('separates official-compatible providers from independent alternatives', async () => {
		const OfficialPost = UltimaBase.Schema.define({
			className: 'OfficialCompatiblePost',
			fields: (field) => ({ title: field.string() }),
		})
		const workflow = createWorkflowPlugin({
			instanceId: 'official',
			stableSchema: OfficialPost,
		})
		expect(
			() => new (UltimaBase.use(workflow.plugin))({ schemas: [OfficialPost] }),
		).toThrow(/requires missing plugin.*@ultimabase\/hooks-plugin/iu)

		const official = new (UltimaBase.use(hooksPlugin(), workflow.plugin))({
			logger: false,
			schemas: [OfficialPost],
		})
		const independent = createAlternativeFixture()
		const alternative = new (UltimaBase.use(independent.engine.plugin))({
			logger: false,
			schemas: [independent.Post],
		})

		try {
			expect(() => official.compile()).not.toThrow()
			expect(() => alternative.compile()).not.toThrow()
			expect('peers' in independent.engine.plugin).toBe(false)
		} finally {
			await Promise.all([official.dispose(), alternative.dispose()])
		}
	})

	it('composes shared low-level middleware without either lifecycle engine', async () => {
		const trace: string[] = []
		const Plain = UltimaBase.Schema.define({
			className: 'SharedMiddlewareNoHooksPost',
			fields: (field) => ({ title: field.string() }),
		})
		const ultimabase = new (UltimaBase.use(
			createBehaviorSupportPlugin(),
			createSharedRuntimeMiddleware((schema) => trace.push(schema)),
		))({ logger: false, schemas: [Plain] })

		try {
			await ultimabase.start()
			await Plain.findMany(undefined)
			expect(trace).toStrictEqual(['SharedMiddlewareNoHooksPost'])
			expect(
				ultimabase.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/hooks-plugin')
		} finally {
			await ultimabase.dispose()
		}
	})
})
