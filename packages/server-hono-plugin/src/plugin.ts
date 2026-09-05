import { requireCapability, type CapabilityRequirement } from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpBrowserPolicyCapability,
	type HttpApplication,
	type HttpBrowserPolicy,
} from '@ultimabase/http-plugin'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import type { Env, Schema } from 'hono'

import {
	normalizeHonoServerPluginOptions,
	type HonoServerPluginOptions,
} from './options.js'
import { HonoServerProvider } from './provider.js'

const honoServerPluginModule: PluginModule<
	'@ultimabase/server-hono-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/server-hono-plugin',
	version: '0.0.0',
})

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

type HonoServerPluginDefinition = Readonly<{
	readonly capabilities: Readonly<{
		readonly requires: readonly [
			typeof applicationRequirement,
			typeof browserPolicyRequirement,
		]
	}>
	readonly environment: readonly ['environment:network']
	readonly hooks: Readonly<{
		readonly dispose: (context: HonoServerLifecycleContext) => Promise<void>
		readonly startTransports: (
			context: HonoServerLifecycleContext,
		) => Promise<void>
		readonly stop: (context: HonoServerLifecycleContext) => Promise<void>
	}>
}>

interface HonoServerLifecycleContext {
	readonly capabilities: Readonly<{
		get(requirement: typeof applicationRequirement): HttpApplication
		get(requirement: typeof browserPolicyRequirement): HttpBrowserPolicy
	}>
}

/** Names one exact, optionally shared Hono server provider definition. */
export type HonoServerPlugin = PluginModuleInstance<
	typeof honoServerPluginModule,
	HonoServerPluginDefinition
>

/** Creates one explicit Hono provider that may be reused across applications. */
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
	const readApplication = (
		context: HonoServerLifecycleContext,
	): HttpApplication => context.capabilities.get(applicationRequirement)
	const readBrowserPolicy = (
		context: HonoServerLifecycleContext,
	): HttpBrowserPolicy => context.capabilities.get(browserPolicyRequirement)

	return honoServerPluginModule.plugin({
		capabilities: {
			requires: [applicationRequirement, browserPolicyRequirement],
		},
		environment: ['environment:network'],
		hooks: {
			startTransports: (context) =>
				provider.start(readApplication(context), readBrowserPolicy(context)),
			stop: (context) => provider.stop(readApplication(context)),
			dispose: (context) => provider.dispose(readApplication(context)),
		},
	})
}
