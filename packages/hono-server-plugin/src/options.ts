import process from 'node:process'

import { assertNonEmptyString } from '@ultimabase/shared'
import {
	definePluginOptionsParser,
	describeEnvironmentSource,
	readDeploymentEnvironment,
} from '@ultimabase/plugin-kit'
import type { Hono, Env, Schema } from 'hono'

/** Configures the framework-owned Node listener created by the plugin. */
export interface ManagedHonoServerPluginOptions {
	/**
	 * Hostname passed to the Node listener. When omitted, the `HOST`
	 * environment variable is used, then `127.0.0.1` in development and every
	 * interface when `NODE_ENV` is `production` (ADR-0312).
	 * @default process.env.HOST ?? (production ? every interface : '127.0.0.1')
	 */
	readonly host?: string
	/**
	 * TCP port passed to the Node listener. Port zero requests an ephemeral port.
	 * When omitted, the `PORT` environment variable is used, then `1337`.
	 * @default process.env.PORT ?? 1337
	 */
	readonly port?: number
	/**
	 * Milliseconds `stop()` waits for in-flight requests before closing the
	 * remaining connections (ADR-0323). @default 10000
	 */
	readonly shutdownTimeoutMs?: number
	/** Compresses responses with gzip or deflate; often done by the proxy instead. @default false */
	readonly compression?: boolean
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
	/**
	 * Assigns CORS ownership to UltimaBase or existing middleware; required
	 * only when `httpPlugin({ browser })` enables CORS (ADR-0323).
	 */
	readonly browserPolicyOwner?: HonoBrowserPolicyOwner
	/** Compresses UltimaBase responses with gzip or deflate. @default false */
	readonly compression?: boolean
	readonly host?: never
	readonly port?: never
	readonly shutdownTimeoutMs?: never
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
	/** `undefined` until CORS needs an owner; UltimaBase answers preflights. */
	readonly browserPolicyOwner: HonoBrowserPolicyOwner | undefined
	readonly compression: boolean
	readonly shutdownTimeoutMs: number
	/** `undefined` listens on every interface. */
	readonly host: string | undefined
	readonly port: number
	/** Where `host` and `port` come from, for the plugin's debug lines. */
	readonly sources: Readonly<{ host: string; port: string }>
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
			`PORT environment variable must be an integer from 0 through 65535 (received ${JSON.stringify(raw)})`,
		)
	}
	return port
}

/** `host`, else `HOST`, else the deployment default (ADR-0312). */
const resolveHost = (
	host: string | undefined,
): Readonly<{ host: string | undefined; source: string }> => {
	if (host !== undefined) return { host, source: 'explicit option' }
	const environmentHost = process.env.HOST
	if (environmentHost !== undefined && environmentHost !== '') {
		return { host: environmentHost, source: 'HOST' }
	}
	const environment = readDeploymentEnvironment()
	return {
		host: environment === 'production' ? undefined : '127.0.0.1',
		source: describeEnvironmentSource(environment),
	}
}

export const normalizeHonoServerPluginOptions: (
	options: unknown,
) => NormalizedHonoServerPluginOptions = definePluginOptionsParser({
	name: 'Hono server plugin options',
	keys: [
		'app',
		'browserPolicyOwner',
		'compression',
		'host',
		'port',
		'shutdownTimeoutMs',
	] as const,
	formatUnknownKey: (key) =>
		`Unknown Hono server plugin option: ${String(key)}`,
	normalize: ({
		app,
		browserPolicyOwner,
		compression = false,
		host,
		port,
		shutdownTimeoutMs,
	}): NormalizedHonoServerPluginOptions => {
		if (typeof compression !== 'boolean') {
			throw new TypeError('Hono server plugin compression must be a boolean')
		}
		if (app !== undefined) {
			if (!isHonoApplication(app)) {
				throw new TypeError('Hono server plugin app must be a Hono application')
			}
			if (
				host !== undefined ||
				port !== undefined ||
				shutdownTimeoutMs !== undefined
			) {
				throw new TypeError(
					'Hono server plugin host, port and shutdownTimeoutMs cannot configure an external app',
				)
			}
			if (
				browserPolicyOwner !== undefined &&
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
				compression,
				host: undefined,
				port: 1337,
				shutdownTimeoutMs: 0,
				sources: { host: 'external app', port: 'external app' },
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
		if (
			shutdownTimeoutMs !== undefined &&
			(typeof shutdownTimeoutMs !== 'number' ||
				!Number.isSafeInteger(shutdownTimeoutMs) ||
				shutdownTimeoutMs < 0)
		) {
			throw new TypeError(
				'Hono server plugin shutdownTimeoutMs must be a non-negative safe integer',
			)
		}
		const listen = resolveHost(host)
		const environmentPort =
			port === undefined ? readEnvironmentPort() : undefined
		return {
			app: undefined,
			browserPolicyOwner: 'ultimabase',
			compression,
			host: listen.host,
			shutdownTimeoutMs: shutdownTimeoutMs ?? 10_000,
			// An explicit port wins, then the hosting convention, then the default.
			port: port ?? environmentPort ?? 1337,
			sources: {
				host: listen.source,
				port:
					port !== undefined
						? 'explicit option'
						: environmentPort !== undefined
							? 'PORT'
							: 'default',
			},
		}
	},
})
