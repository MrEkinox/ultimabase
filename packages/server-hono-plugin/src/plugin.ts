import {
	contributeApplication,
	plugin,
	provideCapability,
	requireCapability,
	type PluginInstance,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpBrowserPolicyCapability,
	httpServerCapability,
} from '@ultimabase/http-plugin'
import { immutableRecord } from '@ultimabase/shared'
import type { Env, Schema } from 'hono'
import type { AddressInfo } from 'node:net'

import {
	normalizeHonoServerPluginOptions,
	type HonoServerPluginOptions,
} from './options.js'
import { HonoServerProvider } from './provider.js'

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const browserPolicyRequirement = requireCapability(
	httpBrowserPolicyCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

/** Application-local view of the managed listener, read with `ultimabase.plugin(server)`. */
export interface HonoServerPluginExports {
	/**
	 * Returns the bound listener address, like Node's `server.address()`, so a
	 * `port: 0` listener can report the port the operating system chose.
	 * `undefined` before start, after stop, and for an existing Hono `app`,
	 * whose listener the plugin does not own.
	 *
	 * @example
	 * ```ts
	 * await ultimabase.start()
	 * const { port } = ultimabase.plugin(server).address() ?? {}
	 * ```
	 */
	address(): AddressInfo | undefined
}

/** Names one exact Hono server provider definition. */
export type HonoServerPlugin = PluginInstance<{
	readonly id: '@ultimabase/server-hono-plugin'
	readonly exports: HonoServerPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly environment: readonly ['environment:network']
}>

/** Creates one explicit Hono provider reusable across sequential application lifetimes. */
export const honoServerPlugin = <
	TEnvironment extends Env = Env,
	TSchema extends Schema = Schema,
	TBasePath extends string = string,
>(
	options: HonoServerPluginOptions<TEnvironment, TSchema, TBasePath> = {},
): HonoServerPlugin => {
	const normalized = normalizeHonoServerPluginOptions(options)
	const provider = new HonoServerProvider(normalized)
	const application = contributeApplication(({ capabilities, logger }) => {
		if (normalized.app === undefined) {
			// ADR-0312: derived values and their sources, at debug level.
			logger.debug(
				`listen host ${normalized.host ?? 'every interface'} (${normalized.sources.host})`,
			)
			logger.debug(
				`listen port ${String(normalized.port)} (${normalized.sources.port})`,
			)
		}
		const httpApplication = capabilities.get(applicationRequirement)
		// Stop and disposal release the same exact owner, including failed-startup cleanup.
		const stop = (): Promise<void> => provider.stop(httpApplication)

		return {
			exports: immutableRecord({ address: () => provider.address }),
			startTransports: () =>
				provider.start(
					httpApplication,
					capabilities.get(browserPolicyRequirement),
				),
			stop,
			dispose: stop,
		}
	})

	// Tells httpPlugin() that its routes have a server (ADR-0313).
	const server = provideCapability(httpServerCapability, {
		contributionId: 'official-hono-http-server',
		create: () => ({
			value: immutableRecord({ name: '@ultimabase/server-hono-plugin' }),
		}),
	})

	return plugin({
		id: '@ultimabase/server-hono-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			applicationRequirement,
			browserPolicyRequirement,
			server,
			application,
		],
		environment: ['environment:network'],
	})
}
