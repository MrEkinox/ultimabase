import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import {
	UltimaBase,
	getCurrentUltimaBase,
	runWithRequestEngine,
} from '../../index.js'
import { plugin } from '../../plugin.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { anonymous } from '../application/plugin-authority.js'

const createApplication = () =>
	applicationFixture(
		new (UltimaBase.use(
			plugin({
				id: 'fixture.current-facade',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [
					provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
				],
			}),
		))({ logger: false, schemas: [] }),
	)

describe('current UltimaBase facade', () => {
	it('selects exact facades across concurrent requests and sequential lifetimes', async () => {
		const first = createApplication()
		const second = createApplication()
		expect(getCurrentUltimaBase).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)
		await first.start()
		try {
			expect(getCurrentUltimaBase()).toBe(first)
			const scope = (app: typeof first) =>
				anonymous(app, { requestId: 'facade', source: 'internal' })
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
			expect(getCurrentUltimaBase()).toBe(second)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
		expect(getCurrentUltimaBase).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)
	})
})
