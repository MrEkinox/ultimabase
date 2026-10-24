// How a transport finds who sends a request (D-49, D-106, D-112).
import { afterEach, describe, expect, it } from 'vitest'
import type { Caller, MasterKey, PluginTypes } from './index.ts'
import { defineApp, definePlugin, memory, PublicError } from './index.ts'
import type { PluginValue } from './plugin.ts'
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

	it('finds Master in a request with the key, logged in production only', async () => {
		const { caller, lines } = await callerOf('secret', 'secret')
		expect(caller).toStrictEqual({ kind: 'master', master: { source: 'key' } })
		expect(isMaster(caller ?? {})).toBe(true)
		expect(lines).not.toContain('A request acts as Master with the master key.')
		process.env['NODE_ENV'] = 'production'
		const allowed = { key: 'secret', production: true } as const
		const audited = await callerOf(allowed, 'secret')
		expect(audited.lines).toContain(
			'A request acts as Master with the master key.',
		)
	})

	it('refuses a wrong key, and logs it', async () => {
		const { caller, lines } = await callerOf('secret', 'secrets')
		expect(caller).toBeInstanceOf(PublicError)
		expect(caller).toStrictEqual(refused('The master key is wrong.'))
		expect(lines).toContain(
			'A request sent the master key, refused: The master key is wrong.',
		)
		// An empty header is a key sent, not none: a client bug to see.
		const empty = await callerOf('secret', '')
		expect(empty.caller).toStrictEqual(refused('The master key is wrong.'))
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

	it('stops start with a key a header cannot carry', async () => {
		for (const key of [' secret', 'secret\n', 'two words', 'clé']) {
			await expect(callerOf(key)).rejects.toThrow(
				'The master key holds a space or a character outside ASCII',
			)
		}
		const symbols = await callerOf('a-Z_0.9~!$', 'a-Z_0.9~!$')
		expect(symbols.caller).toStrictEqual({
			kind: 'master',
			master: { source: 'key' },
		})
	})
})

interface Base extends PluginTypes {
	readonly name: 'base'
	readonly appOptions: { readonly id: string }
}
const base = definePlugin<Base>({
	name: 'base',
	manifest: { name: 'base', version: '1.0.0' },
	// Its own requests only: those that name it.
	identify: async (request, { options }) =>
		request.headers.get('x-who') === 'base'
			? { kind: 'user', user: { id: options.id } }
			: undefined,
})
interface Greedy extends PluginTypes {
	readonly name: 'greedy'
	readonly requires: Base
}
const greedy = definePlugin<Greedy>({
	name: 'greedy',
	manifest: { name: 'greedy', version: '1.0.0' },
	requires: { base: base.plugin },
	// Every request that names someone.
	identify: async (request) =>
		request.headers.has('x-who')
			? { kind: 'user', user: { id: 'greedy' } }
			: undefined,
})

/** The caller of a request with `headers`, plugins in the order given. */
async function pluginCaller(
	plugins: readonly PluginValue<string, string>[],
	headers: Record<string, string>,
) {
	const app = defineApp({
		database: memory(),
		models: [],
		masterKey: 'secret',
		plugins,
	})
	await app.start()
	try {
		const request = new Request('http://localhost/', { headers })
		return await identify?.(request)
	} finally {
		await app.stop()
	}
}

describe('a plugin’s identify', () => {
	const all = [transport.plugin(), base.plugin({ id: 'ada' })]

	it('finds the caller of the requests it knows, with its context', async () => {
		expect(await pluginCaller(all, { 'x-who': 'base' })).toStrictEqual({
			kind: 'user',
			user: { id: 'ada' },
		})
		expect(await pluginCaller(all, { 'x-who': 'other' })).toStrictEqual({
			kind: 'anonymous',
		})
	})

	it('runs in the order of plugins, the first caller winning', async () => {
		const who = { 'x-who': 'base' }
		const first = await pluginCaller([...all, greedy.plugin()], who)
		expect(first).toStrictEqual({ kind: 'user', user: { id: 'ada' } })
		// greedy runs after base starts, and identifies first.
		const listed = [
			transport.plugin(),
			greedy.plugin(),
			base.plugin({ id: 'ada' }),
		]
		expect(await pluginCaller(listed, who)).toStrictEqual({
			kind: 'user',
			user: { id: 'greedy' },
		})
	})

	it('runs after the master key, which wins', async () => {
		const headers = { 'x-who': 'base', 'x-ultimabase-master-key': 'secret' }
		expect(await pluginCaller(all, headers)).toStrictEqual({
			kind: 'master',
			master: { source: 'key' },
		})
	})
})
