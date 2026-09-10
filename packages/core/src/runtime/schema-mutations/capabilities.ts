import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactory,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from '../../plugins/plugin-schema-mutations.js'
import type {
	PluginSchemaMutationHandler,
	PluginSchemaMutationHandlerDefinition,
} from './contracts.js'

const handlerImplementations = new WeakMap<
	object,
	PluginSchemaMutationHandler
>()
const handlerProviders = new WeakSet<object>()

/** Defines one narrow resolver separately from its callback-free mutation token. */
export const schemaMutationHandler = <
	const TMutation extends PluginSchemaMutationDefinition,
>(options: {
	readonly mutation: TMutation
	readonly resolve: PluginSchemaMutationHandler<TMutation>
}): PluginSchemaMutationHandlerDefinition<TMutation> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'schema mutation handler options must be a plain object',
		)
	}
	if (!isPluginSchemaMutationDefinition(options.mutation)) {
		throw new TypeError(
			'schema mutation handler requires a declared mutation token',
		)
	}
	if (typeof options.resolve !== 'function') {
		throw new TypeError('schema mutation handler resolve must be a function')
	}

	const definition = immutableRecord({
		kind: 'plugin-schema-mutation-handler' as const,
		mutation: options.mutation,
	})
	handlerImplementations.set(definition, options.resolve)
	return definition
}

/** Composes independently owned schema-mutation resolvers in graph order. */
export const pluginSchemaMutationHandlerCapability: CapabilityToken<
	PluginSchemaMutationHandlerDefinition,
	readonly PluginSchemaMutationHandlerDefinition[],
	'ultimabase.plugin-schema-mutation-handlers',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	PluginSchemaMutationHandlerDefinition,
	readonly PluginSchemaMutationHandlerDefinition[]
>()({
	capabilityId: 'ultimabase.plugin-schema-mutation-handlers',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) => immutableArray(providers),
})

/** Provides one resolver through Core's nominal schema-mutation facade. */
export const provideSchemaMutationHandler = <
	const TDefinition extends PluginSchemaMutationHandlerDefinition,
>(options: {
	readonly contributionId: string
	readonly create: ApplicationCapabilityFactory<TDefinition>
}): CapabilityProviderDeclaration<
	typeof pluginSchemaMutationHandlerCapability
> => {
	const declaration = provideCapability(
		pluginSchemaMutationHandlerCapability,
		options,
	)
	handlerProviders.add(declaration)
	return declaration
}

/** @internal Reads a resolver only from a nominal handler definition. */
export const getPluginSchemaMutationHandler = (
	definition: unknown,
): PluginSchemaMutationHandler | undefined =>
	typeof definition === 'object' && definition !== null
		? handlerImplementations.get(definition)
		: undefined

/** @internal Rejects generic providers that bypassed the privileged helper. */
export const isAuthorizedPluginSchemaMutationProvider = (
	declaration: CapabilityProviderDeclaration,
): boolean => handlerProviders.has(declaration)
