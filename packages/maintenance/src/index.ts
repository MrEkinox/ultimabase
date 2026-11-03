// Maintenance (D-205): while it is on, every request and WebSocket upgrade but
// Master's answers 503 `MAINTENANCE`, and the sockets open close with 1012.
// Its state is a row: every server follows it through the change feed, and
// starts from `initial` while there is none (D-207). Reads and writes are
// numbered: one that ends after a later one has no effect.
import type { Http } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import type { Logger, PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin, master, PublicError, Refused } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { keyed } from './key.ts'
import { MaintenanceState } from './state.ts'

/** What `maintenancePlugin` takes. */
export interface MaintenanceOptions {
	/** In milliseconds, how long a client waits before it tries again: 60 000 by default. */
	readonly retryAfter?: number
	/** Sent in `x-ultimabase-maintenance-key`, it switches the maintenance and nothing else. */
	readonly key?: string | undefined
	/** The state while none is stored: `'unlocked'` by default. */
	readonly initial?: 'locked' | 'unlocked'
}

/** What the maintenance plugin offers other plugins. */
export interface MaintenanceApi {
	/** Begins the maintenance on every server, once stored. */
	lock(): Promise<void>
	/** Ends it on every server, once stored. */
	unlock(): Promise<void>
	/** Whether this server is in maintenance. */
	locked(): boolean
}

/** The maintenance plugin's types (D-57). */
export interface Maintenance extends PluginTypes {
	readonly name: 'maintenance'
	readonly appOptions: MaintenanceOptions
	readonly requires: Http
	readonly api: MaintenanceApi
	readonly errors: 'MAINTENANCE'
}

/** The route Master turns it on and off with, which it never refuses. */
const path = '/_ultimabase/maintenance'
const key = 'state'

/**
 * This server's state, the reads and writes begun and the last applied, the
 * state while none is stored, and how it closes the sockets open.
 */
interface State {
	locked: boolean
	begun: number
	applied: number
	readonly initial: boolean
	readonly close: () => void
	readonly logger: Logger
}

/**
 * Follows the state the `n`th read or write found, unless a later one was
 * applied: as the maintenance begins, the sockets open close.
 */
function follow(state: State, n: number, locked: boolean): void {
	if (n < state.applied) return
	state.applied = n
	if (locked && !state.locked) state.close()
	state.locked = locked
}

/** Reads the stored state, then follows it. */
async function read(state: State): Promise<void> {
	const n = ++state.begun
	follow(state, n, await stored(state))
}

async function stored(state: State): Promise<boolean> {
	const row = await MaintenanceState.findUnique(
		{ where: { key } },
		{ as: master },
	)
	return row?.enabled ?? state.initial
}

async function store(state: State, locked: boolean): Promise<void> {
	const n = ++state.begun
	await MaintenanceState.upsert(
		{
			where: { key },
			create: { key, enabled: locked },
			update: { enabled: locked },
		},
		{ as: master },
	)
	follow(state, n, locked)
}

/** Reads the state again; keeps the last one when it cannot. */
async function reload(state: State): Promise<void> {
	try {
		await read(state)
	} catch (error) {
		state.logger.error(
			{ err: error },
			'The maintenance state could not be read: it stays as it was.',
		)
	}
}

const states = new WeakMap<object, State>()
function stateOf(context: object): State {
	const state = states.get(context)
	if (state === undefined) throw new Error('The maintenance plugin has no api.')
	return state
}

/** The body of `PUT /_ultimabase/maintenance`, `{ enabled }`. */
function enabledIn(body: unknown): boolean {
	const enabled: unknown =
		typeof body === 'object' && body !== null
			? Reflect.get(body, 'enabled')
			: undefined
	if (typeof enabled !== 'boolean') {
		throw new PublicError(
			'VALIDATION_FAILED',
			'The body is { "enabled": true } or { "enabled": false }.',
		)
	}
	return enabled
}

const maintenance = definePlugin<Maintenance>({
	name: 'maintenance',
	manifest,
	requires: { http: httpPlugin },
	models: [MaintenanceState],
	api: (context) => {
		const { plugins, options, identify, logger } = context
		const { initial = 'unlocked' } = options
		if (initial !== 'locked' && initial !== 'unlocked') {
			throw new Refused("The maintenance's initial is 'locked' or 'unlocked'.")
		}
		const { retryAfter = 60_000 } = options
		if (!Number.isFinite(retryAfter) || retryAfter <= 0) {
			throw new Refused(
				"The maintenance's retryAfter is a positive number of milliseconds.",
			)
		}
		const switches = keyed(options.key)
		const state: State = {
			locked: false,
			begun: 0,
			applied: 0,
			initial: initial === 'locked',
			close: () =>
				plugins.http.closeUpgrades({ code: 1012, reason: 'Maintenance' }),
			logger,
		}
		states.set(context, state)
		const seconds = Math.ceil(retryAfter / 1000)
		plugins.http.gate(async (request) => {
			const switching =
				request.method === 'PUT' && new URL(request.url).pathname === path
			if (!state.locked || switching) {
				return undefined
			}
			const caller = await identify(request).catch(() => undefined)
			if (caller?.kind === 'master') return undefined
			return Response.json(
				{
					code: 'MAINTENANCE',
					message: 'The application is under maintenance.',
					details: { retryAfter: seconds },
				},
				{ status: 503, headers: { 'retry-after': String(seconds) } },
			)
		})
		plugins.http.mount(
			routes().put(path, async (c) => {
				if (c.var.caller.kind !== 'master' && !switches(c.req.raw)) {
					throw new PublicError(
						'ACCESS_DENIED',
						'Only the master key or the maintenance key turns the maintenance on or off.',
					)
				}
				const enabled = enabledIn(await c.req.json().catch(() => undefined))
				await store(state, enabled)
				return c.json({ enabled })
			}),
		)
		return {
			lock: () => store(state, true),
			unlock: () => store(state, false),
			locked: () => state.locked,
		}
	},
	start: async (context) => {
		// A read that fails fails the start: the server must not serve
		// while it does not know whether it is in maintenance (D-207).
		await read(stateOf(context))
	},
	changed: (changes, context) => {
		if (changes.some((change) => change.model === MaintenanceState.name)) {
			void reload(stateOf(context))
		}
	},
	missed: (context) => void reload(stateOf(context)),
})

/** Maintenance, on every server at once (D-205). */
export const maintenancePlugin: PluginOf<Maintenance> = maintenance.plugin
