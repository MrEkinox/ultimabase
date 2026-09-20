import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { definePlugin } from '../plugins/definition.js'
import { Schema } from '../schema/index.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { runWithRequestEngine } from '../runtime/context/active-framework-context.js'
import { RecordingDatabaseAdapter } from '../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../tests/runtime/fixtures/database-adapter-capability.js'

const Post = Schema.define({
	className: 'DrainingPost',
	fields: (field) => ({ title: field.string() }),
})

const createFixture = (value: unknown) => {
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter(
		[{ status: 'fulfilled', value }],
		trace,
	)
	const app = new UltimaBase({
		schemas: [Post],
		plugins: [
			definePlugin({
				pluginId: 'fixture.draining',
				version: '0.0.0',
				core: '^0.0.0',
				capabilities: { provides: [provideTestDatabaseAdapter(adapter)] },
				hooks: {
					dispose: () => {
						trace.push('dispose')
					},
				},
			}),
		],
	})
	onTestFinished(() => app.dispose())
	return { app, adapter, trace }
}

describe('disposal of framework-owned work', () => {
	it('drains a direct static terminal without requiring a surrounding request callback', async () => {
		const row = {
			id: '0198a43e-2431-7000-8000-000000000001',
			title: 'finished',
			createdAt: '2026-09-20T12:00:00.000Z',
			updatedAt: '2026-09-20T12:00:00.000Z',
		}
		const result = Promise.withResolvers<readonly (typeof row)[]>()
		const { app, adapter, trace } = createFixture(result.promise)
		await app.start()
		const reading = Post.findMany(undefined, { ultimabase: app })
		await vi.waitFor(() => {
			expect(adapter.rootRequests).toHaveLength(1)
		})
		const disposing = app.dispose()
		try {
			await Promise.resolve(undefined)
			expect(trace).not.toContain('dispose')
			expect(() => Post.findMany(undefined, { ultimabase: app })).toThrow(
				'initialized active application',
			)
			result.resolve([row])
			expect((await reading)[0]?.title).toBe('finished')
			await disposing
			expect(trace.at(-1)).toBe('dispose')
		} finally {
			result.resolve([])
			await disposing
		}
	})

	it('lets an admitted transaction finish nested work and commit before closing resources', async () => {
		const { app, trace } = createFixture([])
		await app.start()
		const entered = Promise.withResolvers<undefined>()
		const resume = Promise.withResolvers<undefined>()
		const request = app.engine.anonymous({
			requestId: 'transaction-drain',
			source: 'fixture',
		})
		const transaction = request.transaction(async (engine) => {
			entered.resolve(undefined)
			await resume.promise
			return runWithRequestEngine(engine, () => Post.findMany())
		})
		await entered.promise
		const disposing = app.dispose()
		try {
			expect(trace).not.toContain('dispose')
			resume.resolve(undefined)
			await expect(transaction).resolves.toEqual([])
			await disposing
			expect(trace.slice(-2)).toEqual(['adapter:commit', 'dispose'])
			expect(() => runWithRequestEngine(request, () => true)).toThrow(
				'initialized active application',
			)
		} finally {
			resume.resolve(undefined)
			await disposing
		}
	})
})
