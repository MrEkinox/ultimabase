import { AsyncLocalStorage } from 'node:async_hooks'

import { FrameworkError } from '../../foundation.js'
import {
	runWithApplicationOwner,
	runWithApplicationPluginOwner,
} from '../../plugins/callback-execution.js'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import type { CapabilityToken } from '../../plugins/capability-token.js'
import type { OwnedPluginContribution } from '../../plugins/setup-registries.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import {
	readApplicationKernelState,
	readApplicationRuntimeKernelState,
} from '../../application/application-kernel-state.js'
import type { RuntimeLogicalOperationKind } from '../pipeline/contracts.js'

/** Lets cancellation and recursion failures cross resolver error wrapping unchanged. */
export const isFrameworkControlFailure = (error: unknown): boolean =>
	error instanceof FrameworkError &&
	(error.code === 'OPERATION_CANCELLED' ||
		error.code === 'RUNTIME_CALLBACK_RECURSION')

/** Identifies one callback without retaining request values or callback inputs. */
export interface RuntimeCallbackDescriptor {
	readonly key: string
	readonly operationKind: RuntimeLogicalOperationKind
	readonly owner: Readonly<
		| {
				readonly contributionId: string
				readonly kind: 'application'
		  }
		| {
				readonly contributionId: string
				readonly instanceId?: string
				readonly kind: 'plugin'
				readonly pluginId: string
		  }
	>
	readonly phase: string
	readonly target: Readonly<
		| { readonly kind: 'global' }
		| { readonly className: string; readonly kind: 'schema' }
	>
}

interface RuntimeCallbackExecutionState {
	readonly stack: readonly RuntimeCallbackDescriptor[]
}

const emptyStack: readonly RuntimeCallbackDescriptor[] = immutableArray([])

/** Creates stable recursion identity from setup-owned static metadata. */
export const createRuntimeCallbackDescriptor = (
	options: Omit<RuntimeCallbackDescriptor, 'key'>,
): RuntimeCallbackDescriptor => {
	const descriptor = immutableRecord({
		operationKind: options.operationKind,
		owner: immutableRecord(options.owner),
		phase: options.phase,
		target: immutableRecord(options.target),
	})

	return immutableRecord({
		...descriptor,
		key: JSON.stringify([
			descriptor.owner,
			descriptor.target,
			descriptor.phase,
		]),
	})
}

/** Executes application callbacks with shared cancellation and recursion safety. */
export class RuntimeCallbackExecutor {
	readonly #storage = new AsyncLocalStorage<RuntimeCallbackExecutionState>()

	constructor(private readonly application: object = Object.freeze({})) {}

	async invoke<TResult>(
		descriptor: RuntimeCallbackDescriptor,
		context: RequestContext,
		callback: () => MaybePromise<TResult>,
		options: Readonly<{ readonly cancellable?: boolean }> = {},
	): Promise<TResult> {
		const cancellable = options.cancellable ?? true
		const stack = this.#storage.getStore()?.stack ?? emptyStack

		if (cancellable) {
			throwIfOperationCancelled(context.signal, {
				operationKind: descriptor.operationKind,
				phase: descriptor.phase,
			})
		}

		if (stack.some(({ key }) => key === descriptor.key)) {
			throw new FrameworkError(
				'RUNTIME_CALLBACK_RECURSION',
				`Recursive Runtime callback execution detected for ${descriptor.phase}.`,
				{
					publicMessage: 'A recursive Runtime callback was rejected.',
					internalDetails: {
						callback: descriptor,
						reason: 'same-callback-recursion',
						stack,
					},
				},
			)
		}

		const execute = () =>
			this.#storage.run(
				{ stack: immutableArray([...stack, descriptor]) },
				callback,
			)
		const result = await (descriptor.owner.kind === 'application'
			? runWithApplicationOwner(this.application, execute)
			: runWithApplicationPluginOwner(
					this.application,
					immutableRecord({
						pluginId: descriptor.owner.pluginId,
						...(descriptor.owner.instanceId === undefined
							? {}
							: { instanceId: descriptor.owner.instanceId }),
					}),
					execute,
				))

		if (cancellable) {
			throwIfOperationCancelled(context.signal, {
				operationKind: descriptor.operationKind,
				phase: descriptor.phase,
			})
		}

		return result
	}
}

/** Reuses one executor so recursion remains visible across callback categories. */
export const getApplicationRuntimeCallbackExecutor = (
	application: object,
): RuntimeCallbackExecutor => {
	const state = readApplicationRuntimeKernelState(application)
	state.runtimeCallbacks ??= new RuntimeCallbackExecutor(application)
	return state.runtimeCallbacks
}

/** Pairs one validated protected implementation with its setup owner. */
export interface OwnedRuntimeContribution<TImplementation> {
	readonly contribution: OwnedPluginContribution
	readonly implementation: TImplementation
}

/** Reads one Runtime capability in graph order and rejects foreign schema scopes. */
export const readOwnedRuntimeContributions = <
	TImplementation extends { readonly schema: SchemaDefinition | undefined },
>(
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
	token: CapabilityToken,
	label: 'Enforcement' | 'Runtime',
	resolve: (
		contribution: OwnedPluginContribution,
	) => TImplementation | undefined,
): readonly OwnedRuntimeContribution<TImplementation>[] => {
	const owned: OwnedRuntimeContribution<TImplementation>[] = []

	for (const { contributionId, owner, value } of readApplicationKernelState(
		application,
	).capabilityContributions(token)) {
		const contribution = immutableRecord({
			name: contributionId,
			ownerPlugin: owner.pluginId,
			...(owner.instanceId === undefined
				? {}
				: { ownerInstanceId: owner.instanceId }),
			value,
		})
		const implementation = resolve(contribution)
		if (implementation === undefined) continue

		if (
			implementation.schema !== undefined &&
			!application.ownsSchema(implementation.schema)
		) {
			throw new TypeError(
				`${label} contribution "${contribution.name}" references a schema outside its application`,
			)
		}
		owned.push(immutableRecord({ contribution, implementation }))
	}

	return immutableArray(owned)
}

/** Builds one redacted plugin callback identity without operation inputs or results. */
export const createContributionCallbackDescriptor = (
	contribution: OwnedPluginContribution,
	phase: string,
	schema: SchemaDefinition | undefined,
	operationKind: RuntimeLogicalOperationKind,
): RuntimeCallbackDescriptor =>
	createRuntimeCallbackDescriptor({
		operationKind,
		owner: {
			contributionId: contribution.name,
			kind: 'plugin',
			pluginId: contribution.ownerPlugin,
			...(contribution.ownerInstanceId === undefined
				? {}
				: { instanceId: contribution.ownerInstanceId }),
		},
		phase,
		target:
			schema === undefined
				? { kind: 'global' }
				: { className: schema.className, kind: 'schema' },
	})
