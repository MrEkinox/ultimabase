import process from 'node:process'

import { assertNonEmptyString } from '@ultimabase/shared'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import type { Hono, Env, Schema } from 'hono'

/** Configures the framework-owned Node listener created by the plugin. */
export interface ManagedHonoServerPluginOptions {
	/** Optional hostname passed to the Node listener. */
	readonly host?: string
	/**
	 * TCP port passed to the Node listener. Port zero requests an ephemeral port.
	 * When omitted, the `PORT` environment variable is used, then `1337`.
	 * @default process.env.PORT ?? 1337
	 */
	readonly port?: number
	readonly app?: never
	readonly browserPolicyOwner?: never
}

/** Identifies which layer owns every CORS header on an existing Hono app. */
export type HonoBrowserPolicyOwner = 'external' | 'ultimabase'

/** Mounts UltimaBase into an existing Hono application without owning it. */
export interface ExistingHonoServerPluginOptions<
	TEnvironment extends Env = Env,
	TSchema extends Schema = Schema,
	TBasePath extends string = string,
> {
	/** Existing Hono application whose listener remains developer-owned. */
	readonly app: Hono<TEnvironment, TSchema, TBasePath>
	/** Explicitly assigns CORS ownership to UltimaBase or existing middleware. */
	readonly browserPolicyOwner: HonoBrowserPolicyOwner
	readonly host?: never
	readonly port?: never
}

/** Chooses either a framework-owned listener or one externally owned Hono app. */
export type HonoServerPluginOptions<
	TEnvironment extends Env = Env,
	TSchema extends Schema = Schema,
	TBasePath extends string = string,
> =
	| ExistingHonoServerPluginOptions<TEnvironment, TSchema, TBasePath>
	| ManagedHonoServerPluginOptions

export interface NormalizedHonoServerPluginOptions {
	readonly app: Hono | undefined
	readonly browserPolicyOwner: HonoBrowserPolicyOwner
	readonly host: string | undefined
	readonly port: number
}

const isHonoApplication = (value: unknown): value is Hono =>
	(typeof value === 'object' || typeof value === 'function') &&
	value !== null &&
	typeof Reflect.get(value, 'all') === 'function' &&
	typeof Reflect.get(value, 'fetch') === 'function'

/** @internal Validates ownership before the plugin definition can have effects. */
const isPortNumber = (value: number): boolean =>
	Number.isSafeInteger(value) && value >= 0 && value <= 65_535

/** Reads the hosting convention `PORT` once, when the plugin is created. */
const readEnvironmentPort = (): number | undefined => {
	const raw = process.env.PORT
	if (raw === undefined || raw === '') return undefined
	const port = /^\d+$/u.test(raw) ? Number(raw) : Number.NaN
	if (!isPortNumber(port)) {
		throw new TypeError(
			'PORT environment variable must be an integer from 0 through 65535',
		)
	}
	return port
}

export const normalizeHonoServerPluginOptions: (
	options: unknown,
) => NormalizedHonoServerPluginOptions = definePluginOptionsParser({
	name: 'Hono server plugin options',
	keys: ['app', 'browserPolicyOwner', 'host', 'port'] as const,
	formatUnknownKey: (key) =>
		`Unknown Hono server plugin option: ${String(key)}`,
	normalize: ({
		app,
		browserPolicyOwner,
		host,
		port,
	}): NormalizedHonoServerPluginOptions => {
		if (app !== undefined) {
			if (!isHonoApplication(app)) {
				throw new TypeError('Hono server plugin app must be a Hono application')
			}
			if (host !== undefined || port !== undefined) {
				throw new TypeError(
					'Hono server plugin host and port cannot configure an external app',
				)
			}
			if (
				browserPolicyOwner !== 'external' &&
				browserPolicyOwner !== 'ultimabase'
			) {
				throw new TypeError(
					'Hono server plugin browserPolicyOwner must be external or ultimabase',
				)
			}
			return {
				app,
				browserPolicyOwner,
				host: undefined,
				port: 1337,
			}
		}
		if (browserPolicyOwner !== undefined) {
			throw new TypeError(
				'Hono server plugin browserPolicyOwner requires an external app',
			)
		}
		if (host !== undefined) {
			assertNonEmptyString(host, 'Hono server plugin host')
		}
		if (
			port !== undefined &&
			(typeof port !== 'number' || !isPortNumber(port))
		) {
			throw new TypeError(
				'Hono server plugin port must be an integer from 0 through 65535',
			)
		}
		return {
			app: undefined,
			browserPolicyOwner: 'ultimabase',
			host,
			// An explicit port wins, then the hosting convention, then the default.
			port: port ?? readEnvironmentPort() ?? 1337,
		}
	},
})
