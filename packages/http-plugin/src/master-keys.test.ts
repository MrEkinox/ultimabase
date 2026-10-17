import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { describe, expect, it, onTestFinished } from 'vitest'

import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

// ADR-0340 decision 1: a transport that accepts raw keys refuses to start
// without one, naming the option; in-process Master needs none.
const missingKeys =
	'httpPlugin({ master: true }) accepts the X-UltimaBase-Master-Key header, but the application has no Master key to verify it: give new MasterAuthority({ keys, onUse }) at least one key, or remove master: true.'

const createApplication = (masterAuthority?: MasterAuthority) => {
	const App = UltimaBase.use(
		httpTestDatabasePlugin(),
		httpPlugin({
			master: true,
			routes: {
				'GET /mode': (_request, { context }) =>
					Response.json({ mode: context.access.mode }),
			},
		}),
	)
	const ultimabase = new App({
		logger: false,
		schemas: [],
		...(masterAuthority === undefined ? {} : { masterAuthority }),
	})
	onTestFinished(() => ultimabase.dispose())
	return ultimabase
}

const readMode = async (
	ultimabase: ReturnType<typeof createApplication>,
	key: string,
): Promise<unknown> => {
	const response = await ultimabase
		.plugin(httpPlugin)
		.fetch(
			new Request('http://localhost/mode', {
				headers: { 'X-UltimaBase-Master-Key': key },
			}),
		)
	return response.json()
}

describe('HTTP Master keys', () => {
	it('refuses to start without a MasterAuthority', async () => {
		await expect(createApplication().start()).rejects.toThrow(
			new TypeError(missingKeys),
		)
	})

	it('refuses to start when the MasterAuthority has no key', async () => {
		const ultimabase = createApplication(
			new MasterAuthority({ onUse: () => undefined }),
		)

		await expect(ultimabase.start()).rejects.toThrow(new TypeError(missingKeys))
	})

	it('refuses to start when lazy keys resolve to none', async () => {
		const ultimabase = createApplication(
			new MasterAuthority({ keys: () => [], onUse: () => undefined }),
		)

		await expect(ultimabase.start()).rejects.toThrow(new TypeError(missingKeys))
	})

	it('verifies the header with keys read at start', async () => {
		let reads = 0
		const ultimabase = createApplication(
			new MasterAuthority({
				keys: () => {
					reads += 1
					return [{ id: 'operations', value: 'operations-secret' }]
				},
				onUse: () => undefined,
			}),
		)
		expect(reads).toBe(0)

		await ultimabase.start()

		expect(reads).toBe(1)
		expect(await readMode(ultimabase, 'operations-secret')).toStrictEqual({
			mode: 'master',
		})
	})
})
