import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import { isOperationTransportBinding } from '../runtime/plugin-operations/capabilities.js'
import type {
	OperationTransportBindingDefinition,
	PluginOperationHandler,
} from '../runtime/plugin-operations/contracts.js'
import type { PluginSchemaMutationHandler } from '../runtime/schema-mutations/contracts.js'
import type { SchemaMutationTransportBindingDefinition } from '../runtime/schema-mutations/transport-contracts.js'
import { assertExactPlainObject } from '../exact-object-validation.js'
import type { ApplicationCapabilityFactoryContext } from './capabilities.js'
import type {
	PluginOperationHandlerResource,
	PluginSchemaMutationResource,
} from './plugin-command-contribution-contracts.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

export type PluginCommandSource =
	PluginOperationDefinition | PluginSchemaMutationDefinition

export type PluginCommandHandlerResource =
	| Readonly<{
			readonly dispose?: () => MaybePromise<void>
			readonly execute: PluginOperationHandler
			readonly kind: 'operation'
	  }>
	| Readonly<{
			readonly dispose?: () => MaybePromise<void>
			readonly kind: 'mutation'
			readonly resolve: PluginSchemaMutationHandler
	  }>

export interface PluginCommandHandlerPlan {
	readonly contributionId: string
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginCommandHandlerResource>
	readonly source: PluginCommandSource
}

type OperationContributionRuntime = Readonly<{
	create?: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginOperationHandlerResource<PluginOperationDefinition>>
	execute?: PluginOperationHandler
	kind: 'operation'
	source: PluginOperationDefinition
}>

type SchemaMutationContributionRuntime = Readonly<{
	create?: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<
		PluginSchemaMutationResource<PluginSchemaMutationDefinition>
	>
	kind: 'mutation'
	resolve?: PluginSchemaMutationHandler
	source: PluginSchemaMutationDefinition
}>

/** @internal Retains the implementation paired with one nominal command. */
export type PluginCommandContributionRuntime =
	OperationContributionRuntime | SchemaMutationContributionRuntime

export type PluginCommandTransportPlan =
	| Readonly<{
			readonly binding: OperationTransportBindingDefinition
			readonly contributionId: string
			readonly kind: 'operation'
			readonly source: PluginOperationDefinition
	  }>
	| Readonly<{
			readonly binding: SchemaMutationTransportBindingDefinition
			readonly contributionId: string
			readonly kind: 'mutation'
			readonly source: PluginSchemaMutationDefinition
	  }>

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

/** @internal Creates the one lifecycle-aware plan for either command kind. */
export const planPluginCommandHandler = (
	runtime: PluginCommandContributionRuntime,
): PluginCommandHandlerPlan =>
	immutableRecord({
		contributionId: commandContributionId(runtime.kind, runtime.source.name),
		create: async (context) => {
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

/** @internal Projects either nominal wire binding into the canonical graph. */
export const planPluginCommandBinding = (
	binding:
		| OperationTransportBindingDefinition
		| SchemaMutationTransportBindingDefinition,
): PluginCommandTransportPlan => {
	if (isOperationTransportBinding(binding)) {
		return immutableRecord({
			binding,
			contributionId: commandContributionId(
				'operation',
				binding.operation.name,
				binding.transport.name,
			),
			kind: 'operation' as const,
			source: binding.operation,
		})
	}
	return immutableRecord({
		binding,
		contributionId: commandContributionId(
			'mutation',
			binding.mutation.name,
			binding.transport.name,
		),
		kind: 'mutation' as const,
		source: binding.mutation,
	})
}

/** Core-native command facts compiled once from one plugin contribution list. */
export interface PluginCommandPlan {
	readonly declarations: readonly PluginCommandSource[]
	readonly handlers: readonly PluginCommandHandlerPlan[]
	readonly transports: readonly PluginCommandTransportPlan[]
}
