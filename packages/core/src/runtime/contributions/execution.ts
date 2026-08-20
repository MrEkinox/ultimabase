import { AsyncLocalStorage } from 'node:async_hooks'

import { FrameworkError } from '../../foundation.js'
import type { OperationKind } from '../../query/index.js'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'

/** Identifies one callback without retaining request values or callback inputs. */
export interface RuntimeCallbackDescriptor {
	readonly key: string
	readonly operationKind: OperationKind
	readonly owner: Readonly<{
		readonly contributionId: string
		readonly instanceId?: string
		readonly pluginId: string
	}>
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

		const result = await this.#storage.run(
			{ stack: immutableArray([...stack, descriptor]) },
			callback,
		)

		if (cancellable) {
			throwIfOperationCancelled(context.signal, {
				operationKind: descriptor.operationKind,
				phase: descriptor.phase,
			})
		}

		return result
	}
}

const executorsByApplication = new WeakMap<object, RuntimeCallbackExecutor>()

/** Reuses one executor so recursion remains visible across callback categories. */
export const getApplicationRuntimeCallbackExecutor = (
	application: object,
): RuntimeCallbackExecutor => {
	const existing = executorsByApplication.get(application)
	if (existing !== undefined) return existing

	const executor = new RuntimeCallbackExecutor()
	executorsByApplication.set(application, executor)
	return executor
}
