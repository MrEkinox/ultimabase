import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import {
	FrameworkError,
	frameworkErrorCodes,
	type FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { HookExecutionContext } from '../../schema/hooks/execution-context.js'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { runOutsideRequestEngineScope } from '../context/active-framework-storage.js'
import type { RequestContext } from '../context/request-context.js'
import { getCurrentTransactionId } from '../transactions/transaction-execution-storage.js'
import { throwIfOperationCancelled } from './cancellation.js'
import {
	hookDiagnosticsObserverServiceToken,
	type HookDiagnosticEvent,
	type HookDiagnosticsObserver,
} from './diagnostics.js'
import type { HookExecutionDescriptor } from './execution-descriptor.js'

interface HookExecutionFrame {
	readonly key: string
	readonly identity: HookExecutionDescriptor['identity']
}

interface HookExecutionState {
	readonly stack: readonly HookExecutionFrame[]
}

interface HookInvocationOptions {
	/** Finalization observers still run after cancellation has determined the outcome. */
	readonly cancellable?: boolean
}

const emptyHookStack: readonly HookExecutionFrame[] = immutableArray([])
const runtimesByApplication = new WeakMap<object, HookExecutionRuntime>()

const createExecutionContext = (
	request: RequestContext,
): HookExecutionContext =>
	immutableRecord({
		requestId: request.requestId,
		signal: request.signal,
		transactionId: getCurrentTransactionId(),
	})

const createExecutionFrame = (
	descriptor: HookExecutionDescriptor,
): HookExecutionFrame =>
	immutableRecord({ key: descriptor.key, identity: descriptor.identity })

const readErrorCode = (error: unknown): HookDiagnosticEvent['errorCode'] => {
	if (!(error instanceof FrameworkError)) {
		return undefined
	}

	const code: unknown = error.code

	return frameworkErrorCodes.find((candidate) => candidate === code)
}

const createRecursionError = (
	descriptor: HookExecutionDescriptor,
	stack: readonly HookExecutionFrame[],
): FrameworkError<'HOOK_RECURSION'> =>
	new FrameworkError(
		'HOOK_RECURSION',
		`Recursive hook execution detected for ${descriptor.identity.phase}.`,
		{
			publicMessage: 'A recursive hook execution was rejected.',
			internalDetails: {
				hook: descriptor.identity,
				reason: 'same-hook-recursion',
				stack: immutableArray([
					...stack.map(({ identity }) => identity),
					descriptor.identity,
				]),
			},
		},
	)

/** Owns one application's immutable hook stack and safe diagnostic observer. */
export class HookExecutionRuntime {
	readonly #observer: HookDiagnosticsObserver | undefined
	readonly #storage = new AsyncLocalStorage<HookExecutionState>()

	constructor(observer: HookDiagnosticsObserver | undefined) {
		if (observer !== undefined && typeof observer !== 'function') {
			throw new TypeError('Hook diagnostics observer must be a function')
		}

		this.#observer = observer
		Object.freeze(this)
	}

	/** Executes one handler with recursion, cancellation, and telemetry invariants. */
	async invoke<TResult>(
		descriptor: HookExecutionDescriptor,
		request: RequestContext,
		callback: (context: HookExecutionContext) => MaybePromise<TResult>,
		options: HookInvocationOptions = {},
	): Promise<TResult> {
		const cancellable = options.cancellable ?? true
		const executionContext = createExecutionContext(request)
		const parentStack = this.#storage.getStore()?.stack ?? emptyHookStack

		if (cancellable) {
			throwIfOperationCancelled(executionContext.signal, {
				operationKind: descriptor.identity.operationKind,
				phase: descriptor.identity.phase,
			})
		}

		if (parentStack.some(({ key }) => key === descriptor.key)) {
			const recursionError = createRecursionError(descriptor, parentStack)

			this.#notify(
				this.#createDiagnosticEvent(
					descriptor,
					executionContext,
					parentStack.length,
					0,
					'failed',
					recursionError,
				),
			)
			throw recursionError
		}

		const nextStack = immutableArray([
			...parentStack,
			createExecutionFrame(descriptor),
		])
		const startedAt = this.#observer === undefined ? 0 : performance.now()

		return this.#storage.run({ stack: nextStack }, async () => {
			try {
				const result = await callback(executionContext)

				if (cancellable) {
					throwIfOperationCancelled(executionContext.signal, {
						operationKind: descriptor.identity.operationKind,
						phase: descriptor.identity.phase,
					})
				}

				this.#notify(
					this.#createDiagnosticEvent(
						descriptor,
						executionContext,
						parentStack.length,
						startedAt,
						'succeeded',
					),
				)

				return result
			} catch (error: unknown) {
				const status =
					error instanceof FrameworkError &&
					error.code === 'OPERATION_CANCELLED'
						? 'cancelled'
						: 'failed'

				this.#notify(
					this.#createDiagnosticEvent(
						descriptor,
						executionContext,
						parentStack.length,
						startedAt,
						status,
						error,
					),
				)
				throw error
			}
		})
	}

	#createDiagnosticEvent(
		descriptor: HookExecutionDescriptor,
		context: HookExecutionContext,
		depth: number,
		startedAt: number,
		status: HookDiagnosticEvent['status'],
		error?: unknown,
	): HookDiagnosticEvent | undefined {
		if (this.#observer === undefined) {
			return undefined
		}

		const errorCode = readErrorCode(error)

		return immutableRecord({
			declarationBranch: descriptor.identity.declarationBranch,
			depth,
			durationMs:
				startedAt === 0 ? 0 : Math.max(0, performance.now() - startedAt),
			handlerIndex: descriptor.identity.handlerIndex,
			kind: 'hook' as const,
			operationKind: descriptor.identity.operationKind,
			owner: descriptor.identity.owner,
			phase: descriptor.identity.phase,
			requestId: context.requestId,
			status,
			target: descriptor.identity.target,
			transactionId: context.transactionId,
			...(errorCode === undefined ? {} : { errorCode }),
		})
	}

	#notify(event: HookDiagnosticEvent | undefined): void {
		if (event === undefined || this.#observer === undefined) {
			return
		}

		this.#storage.exit(() => {
			runOutsideRequestEngineScope(() => {
				try {
					const observation = this.#observer?.(event)

					void Promise.resolve(observation).catch(() => undefined)
				} catch {
					// Diagnostic failures are deliberately isolated from business execution.
				}
			})
		})
	}
}

/** Reuses one executor so recursion remains visible across every hook category. */
export const getApplicationHookExecutionRuntime = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): HookExecutionRuntime => {
	const existing = runtimesByApplication.get(application)

	if (existing !== undefined) {
		return existing
	}

	const runtime = new HookExecutionRuntime(
		application.getOptionalService(hookDiagnosticsObserverServiceToken),
	)

	runtimesByApplication.set(application, runtime)

	return runtime
}
