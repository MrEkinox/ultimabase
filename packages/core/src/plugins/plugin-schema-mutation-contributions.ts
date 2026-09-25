import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type {
	ApplicationCapabilityFactoryContext,
	CapabilityProviderDeclaration,
} from './capabilities.js'
import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'
import {
	provideSchemaMutationHandler,
	schemaMutationHandler,
	type pluginSchemaMutationHandlerCapability,
} from '../runtime/schema-mutations/capabilities.js'
import type { PluginSchemaMutationHandler } from '../runtime/schema-mutations/contracts.js'
import {
	isSchemaMutationTransportBinding,
	provideSchemaMutationTransportBinding,
	type schemaMutationTransportBindingCapability,
} from '../runtime/schema-mutations/transport-capabilities.js'
import type { SchemaMutationTransportBindingDefinition } from '../runtime/schema-mutations/transport-contracts.js'

/** Owns one materialized schema-mutation resolver and its cleanup. */
export interface PluginSchemaMutationResource<
	TMutation extends PluginSchemaMutationDefinition,
> {
	readonly dispose?: () => MaybePromise<void>
	readonly resolve: PluginSchemaMutationHandler<TMutation>
}

interface PluginSchemaMutationContributionBase<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> {
	/** Selects the exact logical mutation implemented by this contribution. */
	readonly mutation: TMutation
	/** Adds nominal wire bindings without making the mutation publicly exposed. */
	readonly bindings?: TBindings
}

/** Implements one schema mutation without creating an application resource. */
export interface DirectPluginSchemaMutationContributionOptions<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> extends PluginSchemaMutationContributionBase<TMutation, TBindings> {
	readonly create?: never
	readonly resolve: PluginSchemaMutationHandler<TMutation>
}

/** Creates one application-local schema-mutation resolver and cleanup. */
export interface ResourcePluginSchemaMutationContributionOptions<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> extends PluginSchemaMutationContributionBase<TMutation, TBindings> {
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginSchemaMutationResource<TMutation>>
	readonly resolve?: never
}

export type PluginSchemaMutationContributionOptions<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> =
	| DirectPluginSchemaMutationContributionOptions<TMutation, TBindings>
	| ResourcePluginSchemaMutationContributionOptions<TMutation, TBindings>

declare const schemaMutationContributionType: unique symbol

/** Correlates one owned schema mutation with its resolver and wire bindings. */
export interface PluginSchemaMutationContribution<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[] =
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> {
	readonly kind: 'plugin-schema-mutation-contribution'
	readonly mutation: TMutation
	readonly bindings: TBindings
	readonly [schemaMutationContributionType]?: Readonly<{
		readonly mutation: TMutation
		readonly bindings: TBindings
	}>
}

/** Adds one binding separately under the schema mutation's exact owner. */
export interface PluginSchemaMutationBindingContribution<
	TBinding extends SchemaMutationTransportBindingDefinition =
		SchemaMutationTransportBindingDefinition,
> {
	readonly kind: 'plugin-schema-mutation-binding-contribution'
	readonly binding: TBinding
}

export type PluginSchemaMutationAuthoringContribution =
	PluginSchemaMutationContribution | PluginSchemaMutationBindingContribution

export type SchemaMutationProtocolCapabilityProvider =
	| CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>
	| CapabilityProviderDeclaration<
			typeof schemaMutationTransportBindingCapability
	  >

type SchemaMutationContributionRuntime = Readonly<{
	create?: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<
		PluginSchemaMutationResource<PluginSchemaMutationDefinition>
	>
	resolve?: PluginSchemaMutationHandler
}>

const schemaMutationContributions = new WeakMap<
	object,
	SchemaMutationContributionRuntime
>()
const schemaMutationBindingContributions = new WeakSet<object>()
const schemaMutationOptionKeys = new Set([
	'bindings',
	'create',
	'mutation',
	'resolve',
])

export const isPluginSchemaMutationContribution = (
	value: unknown,
): value is PluginSchemaMutationContribution =>
	isPlainRecord(value) && schemaMutationContributions.has(value)

export const isPluginSchemaMutationBindingContribution = (
	value: unknown,
): value is PluginSchemaMutationBindingContribution =>
	isPlainRecord(value) && schemaMutationBindingContributions.has(value)

const assertResource: (
	value: unknown,
) => asserts value is PluginSchemaMutationResource<PluginSchemaMutationDefinition> = (
	value,
) => {
	if (!isPlainRecord(value)) {
		throw new TypeError(
			'plugin schema mutation resource must be a plain object',
		)
	}
	for (const key of Reflect.ownKeys(value)) {
		if (key !== 'dispose' && key !== 'resolve') {
			throw new TypeError(
				`Unknown plugin schema mutation resource option: ${String(key)}`,
			)
		}
	}
	if (typeof value.resolve !== 'function') {
		throw new TypeError(
			'plugin schema mutation resource resolve must be a function',
		)
	}
	if (value.dispose !== undefined && typeof value.dispose !== 'function') {
		throw new TypeError(
			'plugin schema mutation resource dispose must be a function',
		)
	}
}

/** Defines one owned schema mutation without repeating Core registries. */
export const contributeSchemaMutation = <
	const TMutation extends PluginSchemaMutationDefinition,
	const TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[] =
		readonly [],
>(
	options: PluginSchemaMutationContributionOptions<TMutation, TBindings>,
): PluginSchemaMutationContribution<TMutation, TBindings> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'plugin schema mutation contribution must be a plain object',
		)
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !schemaMutationOptionKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin schema mutation contribution option: ${String(key)}`,
			)
		}
	}
	if (!isPluginSchemaMutationDefinition(options.mutation)) {
		throw new TypeError(
			'plugin schema mutation contribution requires a mutation',
		)
	}

	const untrustedBindings: unknown = options.bindings ?? []
	if (!isUnknownArray(untrustedBindings)) {
		throw new TypeError(
			'plugin schema mutation contribution bindings must be an array',
		)
	}
	for (const [index, binding] of untrustedBindings.entries()) {
		if (!isSchemaMutationTransportBinding(binding)) {
			throw new TypeError(
				`plugin schema mutation contribution bindings[${String(index)}] must be created by schemaMutationTransportBinding`,
			)
		}
		if (binding.mutation !== options.mutation) {
			throw new TypeError(
				`plugin schema mutation contribution bindings[${String(index)}] targets another mutation`,
			)
		}
	}

	const hasCreate = Object.hasOwn(options, 'create')
	const hasResolve = Object.hasOwn(options, 'resolve')
	if (hasCreate === hasResolve) {
		throw new TypeError(
			'plugin schema mutation contribution requires exactly one of create or resolve',
		)
	}
	if (hasCreate && typeof options.create !== 'function') {
		throw new TypeError(
			'plugin schema mutation contribution create must be a function',
		)
	}
	if (hasResolve && typeof options.resolve !== 'function') {
		throw new TypeError(
			'plugin schema mutation contribution resolve must be a function',
		)
	}

	const contribution = immutableRecord({
		bindings: immutableArray(untrustedBindings) as TBindings,
		kind: 'plugin-schema-mutation-contribution' as const,
		mutation: options.mutation,
	})
	schemaMutationContributions.set(contribution, {
		...(hasCreate ? { create: options.create } : {}),
		...(hasResolve ? { resolve: options.resolve } : {}),
	})
	return contribution
}

/** Contributes only one binding under the schema mutation's exact owner. */
export const contributeSchemaMutationBinding = <
	const TBinding extends SchemaMutationTransportBindingDefinition,
>(
	binding: TBinding,
): PluginSchemaMutationBindingContribution<TBinding> => {
	if (!isSchemaMutationTransportBinding(binding)) {
		throw new TypeError(
			'plugin schema mutation binding contribution requires a schemaMutationTransportBinding',
		)
	}
	const contribution = immutableRecord({
		binding,
		kind: 'plugin-schema-mutation-binding-contribution' as const,
	})
	schemaMutationBindingContributions.add(contribution)
	return contribution
}

const bindingContributionId = (
	binding: SchemaMutationTransportBindingDefinition,
): string =>
	`schema-mutation:${binding.mutation.name}:transport:${binding.transport.name}`

const provideBinding = (
	binding: SchemaMutationTransportBindingDefinition,
): SchemaMutationProtocolCapabilityProvider =>
	provideSchemaMutationTransportBinding({
		contributionId: bindingContributionId(binding),
		create: () => ({ value: binding }),
	})

export interface CompiledPluginSchemaMutationContribution {
	readonly capabilities: readonly SchemaMutationProtocolCapabilityProvider[]
	readonly mutation?: PluginSchemaMutationDefinition
}

/** @internal Compiles one schema-mutation contribution into private protocols. */
export const compilePluginSchemaMutationContribution = (
	contribution: PluginSchemaMutationAuthoringContribution,
): CompiledPluginSchemaMutationContribution => {
	if (isPluginSchemaMutationContribution(contribution)) {
		const runtime = schemaMutationContributions.get(contribution)
		if (runtime === undefined) {
			throw new TypeError(
				'plugin schema mutation contribution lost its runtime',
			)
		}
		const handler = provideSchemaMutationHandler({
			contributionId: `schema-mutation:${contribution.mutation.name}`,
			create: async (context) => {
				if (runtime.resolve !== undefined) {
					return {
						value: schemaMutationHandler({
							mutation: contribution.mutation,
							resolve: runtime.resolve,
						}),
					}
				}
				const resource = await runtime.create?.(context)
				assertResource(resource)
				return {
					value: schemaMutationHandler({
						mutation: contribution.mutation,
						resolve: resource.resolve,
					}),
					...(resource.dispose === undefined
						? {}
						: { dispose: resource.dispose }),
				}
			},
		})
		return immutableRecord({
			capabilities: immutableArray([
				handler,
				...contribution.bindings.map(provideBinding),
			]),
			mutation: contribution.mutation,
		})
	}

	if (isPluginSchemaMutationBindingContribution(contribution)) {
		return immutableRecord({
			capabilities: immutableArray([provideBinding(contribution.binding)]),
		})
	}

	throw new TypeError('Unknown plugin schema mutation contribution')
}
