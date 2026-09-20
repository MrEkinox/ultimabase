import { describe, expect, it } from 'vitest'
import {
	UltimaBase,
	definePlugin,
	getCurrentUltimaBase,
	runWithRequestEngine,
} from '../../index.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'

const createApplication = () =>
	new UltimaBase({
		pluginPrivileges: { logger: false },
		schemas: [],
		plugins: [
			definePlugin({
				pluginId: 'fixture.current-facade',
				version: '1.0.0',
				core: '^0.0.0',
				capabilities: {
					provides: [
						provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
					],
				},
			}),
		],
	})

describe('current UltimaBase facade', () => {
	it('selects exact facades across concurrent and nested scopes without a default', async () => {
		const first = createApplication()
		const second = createApplication()
		await Promise.all([first.start(), second.start()])
		try {
			expect(getCurrentUltimaBase).toThrow(
				expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
			)
			const scope = (app: typeof first) =>
				app.engine.anonymous({ requestId: 'facade', source: 'internal' })
			const observed = await Promise.all(
				[first, second].map((app) =>
					runWithRequestEngine(scope(app), async () => {
						await Promise.resolve()
						expect(getCurrentUltimaBase()).toBe(app)
						runWithRequestEngine(scope(app === first ? second : first), () => {
							expect(getCurrentUltimaBase()).toBe(
								app === first ? second : first,
							)
						})
						return getCurrentUltimaBase()
					}),
				),
			)
			expect(observed).toEqual([first, second])
			expect(getCurrentUltimaBase).toThrow(
				expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
			)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})
})
