import {
	contributeApplication,
	plugin,
	requireCapability,
	type PluginInstance,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpBrowserPolicyCapability,
} from '@ultimabase/http-plugin'
import type { Env, Schema } from 'hono'

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

/** Names one exact Hono server provider definition. */
export type HonoServerPlugin = PluginInstance<{
	readonly id: '@ultimabase/server-hono-plugin'
	readonly exports: ReturnType<() => void>
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
	const provider = new HonoServerProvider(
		normalizeHonoServerPluginOptions(options),
	)
	const application = contributeApplication(({ capabilities }) => {
		const httpApplication = capabilities.get(applicationRequirement)
		// Stop and disposal release the same exact owner, including failed-startup cleanup.
		const stop = (): Promise<void> => provider.stop(httpApplication)

		return {
			exports: undefined,
			startTransports: () =>
				provider.start(
					httpApplication,
					capabilities.get(browserPolicyRequirement),
				),
			stop,
			dispose: stop,
		}
	})

	return plugin({
		id: '@ultimabase/server-hono-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			applicationRequirement,
			browserPolicyRequirement,
			application,
		],
		environment: ['environment:network'],
	})
}
