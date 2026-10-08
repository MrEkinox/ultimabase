import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import { isOperationTransportBinding } from '../runtime/plugin-operations/capabilities.js'
import type {
	OperationTransportBindingDefinition,
	PluginOperationHandler,
} from '../runtime/plugin-operations/contracts.js'
import type { PluginSchemaMutationHandler } from '../runtime/schema-mutations/contracts.js'
import { isSchemaMutationTransportBinding } from '../runtime/schema-mutations/transport-capabilities.js'
import type { SchemaMutationTransportBindingDefinition } from '../runtime/schema-mutations/transport-contracts.js'
import { assertExactPlainObject } from '../exact-object-validation.js'
import type { ApplicationCapabilityFactoryContext } from './capabilities.js'
import type {
	PluginOperationBindingContribution,
	PluginOperationContribution,
	PluginOperationContributionOptions,
	PluginOperationHandlerResource,
	PluginSchemaMutationContribution,
	PluginSchemaMutationContributionOptions,
	PluginSchemaMutationResource,
} from './plugin-command-contribution-contracts.js'
import type {
	PluginCommandHandlerPlan,
	PluginCommandTransportPlan,
} from './plugin-command-plan.js'
import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from './plugin-operations.js'
import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'

/** Retains the implementation paired with one nominal command. */
type PluginCommandContributionRuntime =
	| Readonly<{
			create?: (
				context: ApplicationCapabilityFactoryContext,
			) => MaybePromise<
				PluginOperationHandlerResource<PluginOperationDefinition>
			>
			execute?: PluginOperationHandler
			kind: 'operation'
			source: PluginOperationDefinition
	  }>
	| Readonly<{
			create?: (
				context: ApplicationCapabilityFactoryContext,
			) => MaybePromise<
				PluginSchemaMutationResource<PluginSchemaMutationDefinition>
			>
			kind: 'mutation'
			resolve?: PluginSchemaMutationHandler
			source: PluginSchemaMutationDefinition
	  }>

/** Core-native facts planned once when a command contribution is created. */
export interface PluginCommandContributionPlan {
	readonly handler?: PluginCommandHandlerPlan
	readonly transports: readonly PluginCommandTransportPlan[]
}

const commandContributions = new WeakMap<
	object,
	PluginCommandContributionPlan
>()

/** @internal Resolves only command contributions created by Core factories. */
export const readPluginCommandContribution = (
	value: object,
): PluginCommandContributionPlan | undefined => commandContributions.get(value)

type CommandResource<TKey extends 'execute' | 'resolve'> = Readonly<{
	readonly dispose?: () => MaybePromise<void>
}> &
	Readonly<Record<TKey, (...arguments_: never[]) => unknown>>

const assertCommandResource: <TKey extends 'execute' | 'resolve'>(
	value: unknown,
	handlerKey: TKey,
	label: string,
) => asserts value is CommandResource<TKey> = (value, handlerKey, label) => {
	assertExactPlainObject(
		value,
		new Set(['dispose', handlerKey]),
		`${label} resource must be a plain object`,
		`Unknown ${label} resource option: `,
	)
	if (typeof value[handlerKey] !== 'function') {
		throw new TypeError(`${label} resource ${handlerKey} must be a function`)
	}
	if (value.dispose !== undefined && typeof value.dispose !== 'function') {
		throw new TypeError(`${label} resource dispose must be a function`)
	}
}

const commandContributionId = (
	kind: PluginCommandContributionRuntime['kind'],
	sourceName: string,
	transportName?: string,
): string =>
	`${kind === 'operation' ? 'operation' : 'schema-mutation'}:${sourceName}${
		transportName === undefined ? '' : `:transport:${transportName}`
	}`

/** Creates the one lifecycle-aware plan for either command kind. */
const planPluginCommandHandler = (
	runtime: PluginCommandContributionRuntime,
): PluginCommandHandlerPlan =>
	immutableRecord({
		contributionId: commandContributionId(runtime.kind, runtime.source.name),
		create: async (context: ApplicationCapabilityFactoryContext) => {
			if (runtime.kind === 'operation') {
				if (runtime.execute !== undefined) {
					return immutableRecord({
						execute: runtime.execute,
						kind: 'operation' as const,
					})
				}
				const resource = await runtime.create?.(context)
				assertCommandResource(resource, 'execute', 'plugin operation')
				return immutableRecord({
					execute: resource.execute,
					kind: 'operation' as const,
					...(resource.dispose === undefined
						? {}
						: { dispose: resource.dispose }),
				})
			}

			if (runtime.resolve !== undefined) {
				return immutableRecord({
					kind: 'mutation' as const,
					resolve: runtime.resolve,
				})
			}
			const resource = await runtime.create?.(context)
			assertCommandResource(resource, 'resolve', 'plugin schema mutation')
			return immutableRecord({
				kind: 'mutation' as const,
				resolve: resource.resolve,
				...(resource.dispose === undefined
					? {}
					: { dispose: resource.dispose }),
			})
		},
		source: runtime.source,
	})

/** Projects either nominal wire binding into the canonical graph. */
const planPluginCommandBinding = (
	binding:
		| OperationTransportBindingDefinition
		| SchemaMutationTransportBindingDefinition,
): PluginCommandTransportPlan =>
	isOperationTransportBinding(binding)
		? immutableRecord({
				binding,
				contributionId: commandContributionId(
					'operation',
					binding.operation.name,
					binding.transport.name,
				),
				kind: 'operation' as const,
				source: binding.operation,
			})
		: immutableRecord({
				binding,
				contributionId: commandContributionId(
					'mutation',
					binding.mutation.name,
					binding.transport.name,
				),
				kind: 'mutation' as const,
				source: binding.mutation,
			})

/** Validates the options shared by operation and schema-mutation contributions. */
const assertCommandOptions = <TBinding>(
	options: unknown,
	spec: Readonly<{
		readonly label: string
		readonly sourceKey: 'mutation' | 'operation'
		readonly sourceDescription: string
		readonly handlerKey: 'execute' | 'resolve'
		readonly isSource: (value: unknown) => boolean
		readonly bindingFactory: string
		readonly isBinding: (candidate: unknown) => candidate is TBinding
		readonly bindingSource: (binding: TBinding) => unknown
	}>,
): readonly TBinding[] => {
	const { label, sourceKey, handlerKey } = spec
	assertExactPlainObject(
		options,
		new Set(['bindings', 'create', handlerKey, sourceKey]),
		`${label} must be a plain object`,
		`Unknown ${label} option: `,
	)
	if (!spec.isSource(options[sourceKey])) {
		throw new TypeError(`${label} requires ${spec.sourceDescription}`)
	}
	const bindings: unknown = options.bindings ?? []
	if (!isUnknownArray(bindings)) {
		throw new TypeError(`${label} bindings must be an array`)
	}
	for (const [index, binding] of bindings.entries()) {
		if (!spec.isBinding(binding)) {
			throw new TypeError(
				`${label} bindings[${String(index)}] must be created by ${spec.bindingFactory}`,
			)
		}
		if (spec.bindingSource(binding) !== options[sourceKey]) {
			throw new TypeError(
				`${label} bindings[${String(index)}] targets another ${sourceKey}`,
			)
		}
	}

	const hasCreate = Object.hasOwn(options, 'create')
	const hasHandler = Object.hasOwn(options, handlerKey)
	if (hasCreate === hasHandler) {
		throw new TypeError(
			`${label} requires exactly one of create or ${handlerKey}`,
		)
	}
	if (hasCreate && typeof options.create !== 'function') {
		throw new TypeError(`${label} create must be a function`)
	}
	if (hasHandler && typeof options[handlerKey] !== 'function') {
		throw new TypeError(`${label} ${handlerKey} must be a function`)
	}
	return immutableArray(bindings.filter(spec.isBinding))
}

const registerCommand = <TContribution extends object>(
	contribution: TContribution,
	plan: PluginCommandContributionPlan,
): TContribution => {
	commandContributions.set(contribution, immutableRecord(plan))
	return contribution
}

/** Defines one owned operation contribution without repeating Core registries. */
export const contributeOperation = <
	const TOperation extends PluginOperationDefinition,
	const TBindings extends
		readonly OperationTransportBindingDefinition<TOperation>[] = readonly [],
>(
	options: PluginOperationContributionOptions<TOperation, TBindings>,
): PluginOperationContribution<TOperation, TBindings> => {
	const bindings = assertCommandOptions(options, {
		label: 'plugin operation contribution',
		sourceKey: 'operation',
		sourceDescription: 'an operation',
		handlerKey: 'execute',
		isSource: isPluginOperationDefinition,
		bindingFactory: 'operationTransportBinding',
		isBinding: isOperationTransportBinding,
		bindingSource: (binding) => binding.operation,
	})
	return registerCommand(
		immutableRecord({
			bindings: bindings as TBindings,
			kind: 'plugin-operation-contribution' as const,
			operation: options.operation,
		}),
		{
			handler: planPluginCommandHandler({
				...(Object.hasOwn(options, 'create') ? { create: options.create } : {}),
				...(Object.hasOwn(options, 'execute')
					? { execute: options.execute }
					: {}),
				kind: 'operation',
				source: options.operation,
			}),
			transports: immutableArray(bindings.map(planPluginCommandBinding)),
		},
	)
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
	return registerCommand(
		immutableRecord({
			binding,
			kind: 'plugin-operation-binding-contribution' as const,
		}),
		{ transports: immutableArray([planPluginCommandBinding(binding)]) },
	)
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
	const bindings = assertCommandOptions(options, {
		label: 'plugin schema mutation contribution',
		sourceKey: 'mutation',
		sourceDescription: 'a mutation',
		handlerKey: 'resolve',
		isSource: isPluginSchemaMutationDefinition,
		bindingFactory: 'schemaMutationTransportBinding',
		isBinding: isSchemaMutationTransportBinding,
		bindingSource: (binding) => binding.mutation,
	})
	return registerCommand(
		immutableRecord({
			bindings: bindings as TBindings,
			kind: 'plugin-schema-mutation-contribution' as const,
			mutation: options.mutation,
		}),
		{
			handler: planPluginCommandHandler({
				...(Object.hasOwn(options, 'create') ? { create: options.create } : {}),
				...(Object.hasOwn(options, 'resolve')
					? { resolve: options.resolve }
					: {}),
				kind: 'mutation',
				source: options.mutation,
			}),
			transports: immutableArray(bindings.map(planPluginCommandBinding)),
		},
	)
}
