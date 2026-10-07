import {
	contributeApplication,
	plugin,
	requireCapability,
	type CapabilityRequirement,
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

const applicationRequirement: CapabilityRequirement<
	typeof httpApplicationCapability,
	false,
	'^1.0.0',
	'setup'
> = requireCapability(httpApplicationCapability, '^1.0.0', { phase: 'setup' })
const browserPolicyRequirement: CapabilityRequirement<
	typeof httpBrowserPolicyCapability,
	false,
	'^1.0.0',
	'setup'
> = requireCapability(httpBrowserPolicyCapability, '^1.0.0', {
	phase: 'setup',
})

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
	const normalized = normalizeHonoServerPluginOptions(
		options as HonoServerPluginOptions,
	)
	const provider = new HonoServerProvider(normalized)
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

	const instance = plugin({
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
	return instance
}
