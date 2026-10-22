// How a transport finds who sends a request (D-49, D-106).
import { afterEach, describe, expect, it } from 'vitest'
import type { Caller, MasterKey, PluginTypes } from './index.ts'
import { defineApp, definePlugin, memory, PublicError } from './index.ts'
import { isMaster } from './rules.ts'
import { recording } from './test/migrating.ts'

interface Transport extends PluginTypes {
	readonly name: 'transport'
}
let identify: ((request: Request) => Promise<Caller>) | undefined
const transport = definePlugin<Transport>({
	name: 'transport',
	manifest: { name: 'transport', version: '1.0.0' },
	start: (context) => {
		identify = context.identify
	},
})

const environment = process.env['NODE_ENV']
afterEach(() => {
	process.env['NODE_ENV'] = environment
})

/** The caller `request` gets from an application with `masterKey`. */
async function callerOf(masterKey: MasterKey, key?: string) {
	const logger = recording()
	const app = defineApp({
		database: memory(),
		plugins: [transport.plugin()],
		models: [],
		masterKey,
		logger,
	})
	await app.start()
	try {
		const headers = key === undefined ? {} : { 'x-ultimabase-master-key': key }
		const request = new Request('http://localhost/', { headers })
		const caller = await identify?.(request).catch((error: unknown) => error)
		return { caller, lines: logger.lines }
	} finally {
		await app.stop()
	}
}

const refused = (message: string) => new PublicError('ACCESS_DENIED', message)

describe('identify', () => {
	it('finds an anonymous caller in a request without the key', async () => {
		const { caller } = await callerOf('secret')
		expect(caller).toStrictEqual({ kind: 'anonymous' })
	})

	it('finds Master in a request with the key, and logs it', async () => {
		const { caller, lines } = await callerOf('secret', 'secret')
		expect(caller).toStrictEqual({ kind: 'master', master: { source: 'key' } })
		expect(isMaster(caller ?? {})).toBe(true)
		expect(lines).toContain('A request acts as Master with the master key.')
	})

	it('refuses a wrong key, and logs it', async () => {
		const { caller, lines } = await callerOf('secret', 'secrets')
		expect(caller).toBeInstanceOf(PublicError)
		expect(caller).toStrictEqual(refused('The master key is wrong.'))
		expect(lines).toContain(
			'A request sent the master key, refused: The master key is wrong.',
		)
	})

	it('refuses a key while none is configured, an empty one included', async () => {
		const none = refused('No master key is configured.')
		expect((await callerOf(undefined, 'secret')).caller).toStrictEqual(none)
		expect((await callerOf('', '')).caller).toStrictEqual(none)
		const unset = { key: undefined, production: true } as const
		expect((await callerOf(unset, 'secret')).caller).toStrictEqual(none)
	})

	it('refuses the key in production unless the application allows it', async () => {
		process.env['NODE_ENV'] = 'production'
		expect((await callerOf('secret', 'secret')).caller).toStrictEqual(
			refused('The master key is refused in production.'),
		)
		const allowed = { key: 'secret', production: true } as const
		expect((await callerOf(allowed, 'secret')).caller).toStrictEqual({
			kind: 'master',
			master: { source: 'key' },
		})
	})
})
