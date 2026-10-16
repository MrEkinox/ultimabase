import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
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
} from '../fixtures/postgres-worker-fixture.js'
import { requestSources, anonymous } from '@ultimabase/core/plugin'

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
	it('executes TypeScript CRUD with no lifecycle or policy engine', async () => {
		const middlewareTrace: string[] = []
		const Application = UltimaBase.use(
			postgresPlugin({
				pool: getFixture().pool,
				schemaPolicy: 'override',
			}),
			createSharedRuntimeMiddleware((schema) => middlewareTrace.push(schema)),
		)
		const Post = Application.Schema.define({
			className: 'TypeScriptNoEnginePost',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
		}).with({ postgres: { table: 'optional_hooks_typescript_posts' } })
		const ultimabase = new Application({
			logger: false,
			schemas: [Post],
		})
		await ultimabase.start()

		try {
			const created = await Post.createOne({
				data: { title: 'TypeScript create' },
			})
			await expect(
				Post.findOne({ where: { id: { eq: created.id } } }),
			).resolves.toMatchObject({ title: 'TypeScript create' })

			const request = anonymous(ultimabase, {
				requestId: 'typescript-no-engine-transaction',
				source: requestSources.internal,
			})
			await expect(
				request.transaction(async () => {
					const committed = await Post.createOne({
						data: { title: 'TypeScript committed' },
					})
					return Post.findOneOrThrow({ where: { id: committed.id } })
				}),
			).resolves.toMatchObject({ title: 'TypeScript committed' })
			await expect(
				Post.updateOne({
					data: { title: 'TypeScript update' },
					where: { id: created.id },
				}),
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
				Post.count({ where: { title: { eq: 'TypeScript rollback' } } }),
			).resolves.toBe(0)
			await expect(
				Post.deleteOne({ where: { id: created.id } }),
			).resolves.toMatchObject({
				id: created.id,
			})
			await expect(
				Post.exists({ where: { id: { eq: created.id } } }),
			).resolves.toBe(false)

			expect(middlewareTrace).toContain('TypeScriptNoEnginePost')
			expect(
				ultimabase.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/hooks-plugin')
			expect(
				ultimabase.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/access-plugin')
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)

	it('executes the same no-lifecycle and no-policy proof from JavaScript', async () => {
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
		const engine = createAlternativeBehaviorEngine({ instanceId: 'postgres' })
		const observer = createAlternativeBehaviorDiagnosticObserver(
			({ event }) => {
				diagnostics.push({
					payload: event.payload,
					transactionId: event.transactionId,
				})
			},
		)
		const Application = UltimaBase.use(
			postgresPlugin({
				pool: getFixture().pool,
				schemaPolicy: 'override',
			}),
			observer,
			engine.plugin,
		)
		const Post = Application.Schema.define({
			className: 'AlternativePostgresPost',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
		}).with({
			alternativeBehavior: alternativeBehavior({ label: 'publishing' }),
			postgres: { table: 'optional_hooks_alternative_posts' },
		})
		const ultimabase = new Application({
			logger: false,
			schemas: [Post],
		})
		await ultimabase.start()

		try {
			const created = await Post.createOne({
				data: { title: 'Alternative create' },
			})
			expect(
				await engine.Audit.count({ where: { label: { eq: 'publishing' } } }),
			).toBe(1)
			expect(diagnostics).toHaveLength(1)

			const request = anonymous(ultimabase, {
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
				await Post.count({ where: { title: { eq: 'Alternative rollback' } } }),
			).toBe(0)
			expect(
				await engine.Audit.count({ where: { label: { eq: 'publishing' } } }),
			).toBe(1)
			expect(diagnostics).toHaveLength(1)

			await Post.updateOne({
				data: { title: 'Alternative update' },
				where: { id: created.id },
			})
			await Post.deleteOne({ where: { id: created.id } })
			expect(
				await engine.Audit.findMany({ orderBy: { createdAt: 'asc' } }),
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
				ultimabase.plugin(alternativeBehaviorPluginId).diagnostics(),
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
				ultimabase.pluginPrivilegeReport.plugins.map(
					({ identity }) => identity.pluginId,
				),
			).not.toContain('@ultimabase/hooks-plugin')
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)
})
