import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import {
	UltimaBase,
	plugin,
	getCurrentUltimaBase,
	runWithRequestEngine,
} from '../../index.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'

const createApplication = () =>
	applicationFixture(
		new UltimaBase({
			pluginPrivileges: { logger: false },
			schemas: [],
			plugins: [
				plugin({
					id: 'fixture.current-facade',
					version: '1.0.0',
					core: '^0.0.0',
					contributions: [
						provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
					],
				}),
			],
		}),
	)

describe('current UltimaBase facade', () => {
	it('selects exact facades across concurrent requests and sequential lifetimes', async () => {
		const first = createApplication()
		const second = createApplication()
		await first.start()
		try {
			expect(getCurrentUltimaBase).toThrow(
				expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
			)
			const scope = (app: typeof first) =>
				app.engine.anonymous({ requestId: 'facade', source: 'internal' })
			const observed = await Promise.all(
				[first, first].map((app) =>
					runWithRequestEngine(scope(app), async () => {
						await Promise.resolve()
						expect(getCurrentUltimaBase()).toBe(app)
						runWithRequestEngine(scope(app), () => {
							expect(getCurrentUltimaBase()).toBe(app)
						})
						return getCurrentUltimaBase()
					}),
				),
			)
			expect(observed).toEqual([first, first])
			const oldRequest = scope(first)
			await first.dispose()
			await second.start()
			expect(runWithRequestEngine(scope(second), getCurrentUltimaBase)).toBe(
				second,
			)
			expect(() =>
				runWithRequestEngine(oldRequest, getCurrentUltimaBase),
			).toThrow('initialized active application')
			expect(getCurrentUltimaBase).toThrow(
				expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
			)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})
})
