import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { Schema, UltimaBase, requestSources } from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	alternativeBehavior,
	alternativeBehaviorPluginId,
	createAlternativeBehaviorDiagnosticObserver,
	createAlternativeBehaviorEngine,
	createSharedRuntimeMiddleware,
	type AlternativeBehaviorDiagnosticPayload,
} from './fixtures/alternative-behavior-engine.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const executeFile = promisify(execFile)
const javascriptFixture = path.join(
	import.meta.dirname,
	'fixtures/no-hooks-postgres.mjs',
)

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('Optional Hooks PostgreSQL fixture has not started')
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'optional_hooks' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('optional Hooks PostgreSQL proof', { concurrent: false }, () => {
	it('executes TypeScript CRUD and explicit transactions with no lifecycle engine', async () => {
		const middlewareTrace: string[] = []
		const Post = Schema.define({
			className: 'TypeScriptNoEnginePost',
			extensions: [postgresTable({ name: 'optional_hooks_typescript_posts' })],
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({
					pool: getFixture().pool,
					schemaPolicy: 'override',
				}),
				createSharedRuntimeMiddleware((schema) => middlewareTrace.push(schema)),
			],
			schemas: [Post],
		})
		await ultimabase.start()

		try {
			const created = await Post.createOne(
				{ data: { title: 'TypeScript create' } },
				{ ultimabase },
			)
			await expect(
				Post.findOne({ where: { id: { eq: created.id } } }, { ultimabase }),
			).resolves.toMatchObject({ title: 'TypeScript create' })

			const request = ultimabase.engine.anonymous({
				requestId: 'typescript-no-engine-transaction',
				source: requestSources.internal,
			})
			await expect(
				request.transaction(async () => {
					const committed = await Post.createOne({
						data: { title: 'TypeScript committed' },
					})
					return Post.get({ id: committed.id })
				}),
			).resolves.toMatchObject({ title: 'TypeScript committed' })
			await expect(
				Post.updateOne(
					{ data: { title: 'TypeScript update' }, id: created.id },
					{ ultimabase },
				),
			).resolves.toMatchObject({ title: 'TypeScript update' })
			await expect(
				request.transaction(async () => {
					await Post.createOne({
						data: { title: 'TypeScript rollback' },
					})
					throw new Error('rollback TypeScript transaction')
				}),
			).rejects.toThrow('rollback TypeScript transaction')
			await expect(
				Post.count(
					{ where: { title: { eq: 'TypeScript rollback' } } },
					{ ultimabase },
				),
			).resolves.toBe(0)
			await expect(
				Post.deleteOne({ id: created.id }, { ultimabase }),
			).resolves.toMatchObject({ id: created.id })
			await expect(
				Post.exists({ where: { id: { eq: created.id } } }, { ultimabase }),
			).resolves.toBe(false)

			expect(middlewareTrace).toContain('TypeScriptNoEnginePost')
			expect(
				ultimabase.application.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/hooks-plugin')
			expect(ultimabase.application.typegenGraph.options).toStrictEqual([])
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)

	it('executes the same no-engine proof from JavaScript without Typegen', async () => {
		const { stdout } = await executeFile(
			process.execPath,
			[javascriptFixture],
			{
				env: {
					...process.env,
					ULTIMABASE_TEST_DATABASE_URL: getFixture().connectionUri,
				},
			},
		)
		const output: unknown = JSON.parse(stdout)

		expect(output).toStrictEqual({
			committed: 1,
			created: 'JavaScript create',
			deleted: 'JavaScript update',
			existsAfterDelete: false,
			found: 'JavaScript create',
			inspection: {
				options: [],
				plugins: ['@ultimabase/postgres-plugin'],
			},
			rollbackMessage: 'rollback JavaScript transaction',
			rolledBack: 0,
			updated: 'JavaScript update',
		})
	}, 30_000)

	it('runs an independent behavior engine with transactional audit and diagnostics', async () => {
		const diagnostics: Readonly<{
			readonly payload: AlternativeBehaviorDiagnosticPayload
			readonly transactionId: string
		}>[] = []
		const Post = Schema.define({
			className: 'AlternativePostgresPost',
			extensions: [
				alternativeBehavior({ label: 'publishing' }),
				postgresTable({ name: 'optional_hooks_alternative_posts' }),
			],
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
		})
		const engine = createAlternativeBehaviorEngine({ instanceId: 'postgres' })
		const observer = createAlternativeBehaviorDiagnosticObserver(
			({ event }) => {
				diagnostics.push({
					payload: event.payload,
					transactionId: event.transactionId,
				})
			},
		)
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({
					pool: getFixture().pool,
					schemaPolicy: 'override',
				}),
				observer,
				engine.plugin,
			],
			schemas: [Post],
		})
		await ultimabase.start()

		try {
			const created = await Post.createOne(
				{ data: { title: 'Alternative create' } },
				{ ultimabase },
			)
			expect(
				await engine.Audit.count(
					{ where: { label: { eq: 'publishing' } } },
					{ ultimabase },
				),
			).toBe(1)
			expect(diagnostics).toHaveLength(1)

			const request = ultimabase.engine.anonymous({
				requestId: 'alternative-behavior-rollback',
				source: requestSources.internal,
			})
			await expect(
				request.transaction(async () => {
					await Post.createOne({
						data: { title: 'Alternative rollback' },
					})
					throw new Error('rollback alternative behavior')
				}),
			).rejects.toThrow('rollback alternative behavior')
			expect(
				await Post.count(
					{ where: { title: { eq: 'Alternative rollback' } } },
					{ ultimabase },
				),
			).toBe(0)
			expect(
				await engine.Audit.count(
					{ where: { label: { eq: 'publishing' } } },
					{ ultimabase },
				),
			).toBe(1)
			expect(diagnostics).toHaveLength(1)

			await Post.updateOne(
				{ data: { title: 'Alternative update' }, id: created.id },
				{ ultimabase },
			)
			await Post.deleteOne({ id: created.id }, { ultimabase })
			expect(
				await engine.Audit.findMany(
					{ orderBy: { createdAt: 'asc' } },
					{ ultimabase },
				),
			).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ action: 'create-one' }),
					expect.objectContaining({ action: 'update-one' }),
					expect.objectContaining({ action: 'delete-one' }),
				]),
			)
			expect(diagnostics.map(({ payload }) => payload.operation)).toStrictEqual(
				['create-one', 'update-one', 'delete-one'],
			)
			expect(
				new Set(diagnostics.map(({ transactionId }) => transactionId)).size,
			).toBe(3)
			expect(
				ultimabase.application
					.getPlugin(alternativeBehaviorPluginId)
					.diagnostics(),
			).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						operation: 'create-one',
						phase: 'before-operation',
					}),
					expect.objectContaining({
						operation: 'delete-one',
						phase: 'result',
					}),
				]),
			)
			expect(
				ultimabase.application.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/hooks-plugin')
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)
})
