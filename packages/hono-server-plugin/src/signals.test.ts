import process from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { Hono } from 'hono'
import { describe, expect, it, onTestFinished } from 'vitest'

import { honoServerPlugin } from './plugin.js'
import type { HonoServerPluginOptions } from './options.js'

// ADR-0340 decision 2: the managed listener stops the application on
// SIGINT and SIGTERM unless `stopOnSignals: false` turns it off.
type Signal = 'SIGINT' | 'SIGTERM'
type SignalListener = (signal: Signal) => void

const listeners = (signal: Signal): readonly SignalListener[] =>
	process.listeners(signal)

const createApplication = (options: HonoServerPluginOptions) => {
	const App = UltimaBase.use(httpPlugin(), honoServerPlugin(options))
	const ultimabase = new App({ logger: false, schemas: [] })
	onTestFinished(() => ultimabase.dispose())
	return ultimabase
}

const addedListener = (
	before: readonly SignalListener[],
	signal: Signal,
): SignalListener => {
	const added = listeners(signal).filter(
		(listener) => !before.includes(listener),
	)
	expect(added).toHaveLength(1)
	const [listener] = added
	if (listener === undefined) throw new TypeError('No signal listener added')
	return listener
}

describe('honoServerPlugin signals', () => {
	it.each(['SIGINT', 'SIGTERM'] as const)(
		'stops the application on %s by default',
		async (signal) => {
			const before = listeners(signal)
			const ultimabase = createApplication({ host: '127.0.0.1', port: 0 })
			await ultimabase.start()
			const listener = addedListener(before, signal)

			listener(signal)

			await expect(ultimabase.closed).resolves.toBeUndefined()
			expect(ultimabase.state).toBe('stopped')
			expect(listeners('SIGINT')).not.toContain(listener)
			expect(listeners('SIGTERM')).not.toContain(listener)
		},
	)

	it('removes its listeners when the application stops otherwise', async () => {
		const interrupt = listeners('SIGINT')
		const terminate = listeners('SIGTERM')
		const ultimabase = createApplication({ host: '127.0.0.1', port: 0 })
		await ultimabase.start()
		addedListener(interrupt, 'SIGINT')
		addedListener(terminate, 'SIGTERM')

		await ultimabase.dispose()

		expect(listeners('SIGINT')).toStrictEqual(interrupt)
		expect(listeners('SIGTERM')).toStrictEqual(terminate)
	})

	it('leaves signals alone with stopOnSignals: false', async () => {
		const interrupt = listeners('SIGINT')
		const terminate = listeners('SIGTERM')
		const ultimabase = createApplication({
			host: '127.0.0.1',
			port: 0,
			stopOnSignals: false,
		})

		await ultimabase.start()

		expect(listeners('SIGINT')).toStrictEqual(interrupt)
		expect(listeners('SIGTERM')).toStrictEqual(terminate)
		expect(ultimabase.state).toBe('started')
	})

	it('leaves signals to the owner of an existing Hono app', async () => {
		const interrupt = listeners('SIGINT')
		const ultimabase = createApplication({ app: new Hono() })

		await ultimabase.start()

		expect(listeners('SIGINT')).toStrictEqual(interrupt)
	})

	it('validates stopOnSignals', () => {
		expect(() => honoServerPlugin({ stopOnSignals: 'yes' as never })).toThrow(
			new TypeError('Hono server plugin stopOnSignals must be a boolean'),
		)
		expect(() =>
			honoServerPlugin({ app: new Hono(), stopOnSignals: false as never }),
		).toThrow(
			new TypeError(
				'Hono server plugin stopOnSignals cannot configure an external app: its listener and signals stay yours',
			),
		)
	})
})
