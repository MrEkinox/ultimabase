import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import {
	type ApplicationCapabilityFactoryContext,
	type CapabilityProviderDeclaration,
	type PluginCapabilityDeclaration,
} from './capabilities.js'
import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from './plugin-operations.js'
import {
	isOperationTransportBinding,
	operationHandler,
	provideOperationHandler,
	provideOperationTransportBinding,
	type operationTransportBindingCapability,
	type pluginOperationHandlerCapability,
} from '../runtime/plugin-operations/capabilities.js'
import type {
	OperationTransportBindingDefinition,
	PluginOperationHandler,
} from '../runtime/plugin-operations/contracts.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'
import {
	compilePluginSchemaMutationContribution,
	isPluginSchemaMutationBindingContribution,
	isPluginSchemaMutationContribution,
	type PluginSchemaMutationAuthoringContribution,
	type SchemaMutationProtocolCapabilityProvider,
} from './plugin-schema-mutation-contributions.js'

/** Owns one materialized operation handler and its deterministic cleanup. */
export interface PluginOperationHandlerResource<
	TOperation extends PluginOperationDefinition,
> {
	readonly dispose?: () => MaybePromise<void>
	readonly execute: PluginOperationHandler<TOperation>
}

interface PluginOperationContributionBase<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> {
	/** Selects the exact logical contract implemented by this contribution. */
	readonly operation: TOperation
	/** Adds nominal wire bindings without making the operation publicly exposed. */
	readonly bindings?: TBindings
}

/** Implements one operation directly without creating an application resource. */
export interface DirectPluginOperationContributionOptions<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> extends PluginOperationContributionBase<TOperation, TBindings> {
	readonly create?: never
	readonly execute: PluginOperationHandler<TOperation>
}

/** Creates one application-local operation handler and optional cleanup. */
export interface ResourcePluginOperationContributionOptions<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> extends PluginOperationContributionBase<TOperation, TBindings> {
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginOperationHandlerResource<TOperation>>
	readonly execute?: never
}

export type PluginOperationContributionOptions<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> =
	| DirectPluginOperationContributionOptions<TOperation, TBindings>
	| ResourcePluginOperationContributionOptions<TOperation, TBindings>

declare const operationContributionType: unique symbol

/** Correlates one owned operation with its handler and optional wire bindings. */
export interface PluginOperationContribution<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[] =
		readonly OperationTransportBindingDefinition<TOperation>[],
> {
	readonly kind: 'plugin-operation-contribution'
	readonly operation: TOperation
	readonly bindings: TBindings
	readonly [operationContributionType]?: Readonly<{
		readonly operation: TOperation
		readonly bindings: TBindings
	}>
}

/** Adds a wire binding separately under the operation owner's same plugin. */
export interface PluginOperationBindingContribution<
	TBinding extends OperationTransportBindingDefinition =
		OperationTransportBindingDefinition,
> {
	readonly kind: 'plugin-operation-binding-contribution'
	readonly binding: TBinding
}

export type PluginOperationAuthoringContribution =
	| PluginOperationContribution
	| PluginOperationBindingContribution
	| PluginSchemaMutationAuthoringContribution

type OperationProtocolCapabilityProvider =
	| CapabilityProviderDeclaration<typeof pluginOperationHandlerCapability>
	| CapabilityProviderDeclaration<typeof operationTransportBindingCapability>
	| SchemaMutationProtocolCapabilityProvider

/** Adds Core-derived operation providers to an author's explicit capabilities. */
export type PluginOperationContributionCapabilities<
	TCapabilities,
	TOperations,
> = TOperations extends readonly []
	? TCapabilities
	: TOperations extends readonly PluginOperationAuthoringContribution[]
		? TCapabilities extends readonly PluginCapabilityDeclaration[]
			? readonly [...TCapabilities, ...OperationProtocolCapabilityProvider[]]
			: readonly PluginCapabilityDeclaration[]
		: TCapabilities

interface CompiledPluginOperationContributions {
	readonly capabilities: readonly OperationProtocolCapabilityProvider[]
	readonly operations: readonly (
		PluginOperationDefinition | PluginSchemaMutationDefinition
	)[]
}

type OperationContributionRuntime = Readonly<{
	create?: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginOperationHandlerResource<PluginOperationDefinition>>
	execute?: PluginOperationHandler
}>

const operationContributions = new WeakMap<
	object,
	OperationContributionRuntime
>()
const operationBindingContributions = new WeakSet<object>()
const operationOptionKeys = new Set([
	'bindings',
	'create',
	'execute',
	'operation',
])

const isPluginOperationContribution = (
	value: unknown,
): value is PluginOperationContribution =>
	isPlainRecord(value) && operationContributions.has(value)

const isPluginOperationBindingContribution = (
	value: unknown,
): value is PluginOperationBindingContribution =>
	isPlainRecord(value) && operationBindingContributions.has(value)

const assertHandlerResource: (
	value: unknown,
) => asserts value is PluginOperationHandlerResource<PluginOperationDefinition> = (
	value,
) => {
	if (!isPlainRecord(value)) {
		throw new TypeError('plugin operation resource must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (key !== 'dispose' && key !== 'execute') {
			throw new TypeError(
				`Unknown plugin operation resource option: ${String(key)}`,
			)
		}
	}
	if (typeof value.execute !== 'function') {
		throw new TypeError('plugin operation resource execute must be a function')
	}
	if (value.dispose !== undefined && typeof value.dispose !== 'function') {
		throw new TypeError('plugin operation resource dispose must be a function')
	}
}

/** Defines one owned operation contribution without repeating Core registries. */
export const contributeOperation = <
	const TOperation extends PluginOperationDefinition,
	const TBindings extends
		readonly OperationTransportBindingDefinition<TOperation>[] = readonly [],
>(
	options: PluginOperationContributionOptions<TOperation, TBindings>,
): PluginOperationContribution<TOperation, TBindings> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('plugin operation contribution must be a plain object')
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !operationOptionKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin operation contribution option: ${String(key)}`,
			)
		}
	}
	if (!isPluginOperationDefinition(options.operation)) {
		throw new TypeError('plugin operation contribution requires an operation')
	}

	const untrustedBindings: unknown = options.bindings ?? []
	if (!isUnknownArray(untrustedBindings)) {
		throw new TypeError(
			'plugin operation contribution bindings must be an array',
		)
	}
	for (const [index, binding] of untrustedBindings.entries()) {
		if (!isOperationTransportBinding(binding)) {
			throw new TypeError(
				`plugin operation contribution bindings[${String(index)}] must be created by operationTransportBinding`,
			)
		}
		if (binding.operation !== options.operation) {
			throw new TypeError(
				`plugin operation contribution bindings[${String(index)}] targets another operation`,
			)
		}
	}

	const hasCreate = Object.hasOwn(options, 'create')
	const hasExecute = Object.hasOwn(options, 'execute')
	if (hasCreate === hasExecute) {
		throw new TypeError(
			'plugin operation contribution requires exactly one of create or execute',
		)
	}
	if (hasCreate && typeof options.create !== 'function') {
		throw new TypeError(
			'plugin operation contribution create must be a function',
		)
	}
	if (hasExecute && typeof options.execute !== 'function') {
		throw new TypeError(
			'plugin operation contribution execute must be a function',
		)
	}

	const contribution = immutableRecord({
		bindings: immutableArray(untrustedBindings) as TBindings,
		kind: 'plugin-operation-contribution' as const,
		operation: options.operation,
	})
	operationContributions.set(contribution, {
		...(hasCreate ? { create: options.create } : {}),
		...(hasExecute ? { execute: options.execute } : {}),
	})
	return contribution
}

/** Contributes only one binding while preserving exact operation ownership. */
export const contributeOperationBinding = <
	const TBinding extends OperationTransportBindingDefinition,
>(
	binding: TBinding,
): PluginOperationBindingContribution<TBinding> => {
	if (!isOperationTransportBinding(binding)) {
		throw new TypeError(
			'plugin operation binding contribution requires an operationTransportBinding',
		)
	}
	const contribution = immutableRecord({
		binding,
		kind: 'plugin-operation-binding-contribution' as const,
	})
	operationBindingContributions.add(contribution)
	return contribution
}

const bindingContributionId = (
	binding: OperationTransportBindingDefinition,
): string =>
	`operation:${binding.operation.name}:transport:${binding.transport.name}`

const provideBinding = (
	binding: OperationTransportBindingDefinition,
): OperationProtocolCapabilityProvider =>
	provideOperationTransportBinding({
		contributionId: bindingContributionId(binding),
		create: () => ({ value: binding }),
	})

/** @internal Compiles authoring contributions into the existing private protocols. */
export const compilePluginOperationContributions = (
	contributions: readonly PluginOperationAuthoringContribution[] | undefined,
): CompiledPluginOperationContributions => {
	if (contributions === undefined) {
		return immutableRecord({
			capabilities: immutableArray([]),
			operations: immutableArray([]),
		})
	}
	const untrustedContributions: unknown = contributions
	if (!isUnknownArray(untrustedContributions)) {
		throw new TypeError('plugin operation contributions must be an array')
	}

	const capabilities: OperationProtocolCapabilityProvider[] = []
	const operations: (
		PluginOperationDefinition | PluginSchemaMutationDefinition
	)[] = []
	for (const [index, contribution] of untrustedContributions.entries()) {
		if (!isPlainRecord(contribution)) {
			throw new TypeError(
				`plugin operation contributions[${String(index)}] must be created by a Core contribution factory`,
			)
		}

		if (isPluginOperationContribution(contribution)) {
			const runtime = operationContributions.get(contribution)
			if (runtime === undefined) {
				throw new TypeError('plugin operation contribution lost its runtime')
			}
			operations.push(contribution.operation)
			capabilities.push(
				provideOperationHandler({
					contributionId: `operation:${contribution.operation.name}`,
					create: async (context) => {
						if (runtime.execute !== undefined) {
							return {
								value: operationHandler({
									execute: runtime.execute,
									operation: contribution.operation,
								}),
							}
						}

						const resource = await runtime.create?.(context)
						assertHandlerResource(resource)
						return {
							value: operationHandler({
								execute: resource.execute,
								operation: contribution.operation,
							}),
							...(resource.dispose === undefined
								? {}
								: { dispose: resource.dispose }),
						}
					},
				}),
			)
			for (const binding of contribution.bindings) {
				capabilities.push(provideBinding(binding))
			}
			continue
		}

		if (isPluginOperationBindingContribution(contribution)) {
			capabilities.push(provideBinding(contribution.binding))
			continue
		}

		if (
			isPluginSchemaMutationContribution(contribution) ||
			isPluginSchemaMutationBindingContribution(contribution)
		) {
			const compiled = compilePluginSchemaMutationContribution(contribution)
			capabilities.push(...compiled.capabilities)
			if (compiled.mutation !== undefined) operations.push(compiled.mutation)
			continue
		}

		throw new TypeError(
			`plugin operation contributions[${String(index)}] must be created by a Core contribution factory`,
		)
	}

	return immutableRecord({
		capabilities: immutableArray(capabilities),
		operations: immutableArray(operations),
	})
}
