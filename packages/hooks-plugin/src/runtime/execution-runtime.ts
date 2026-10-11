import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import {
	FrameworkError,
	frameworkErrorCodes,
	getCurrentTransactionId,
	getRequestPrincipal,
	runOutsideRequestEngineScope,
	runWithQueryExecutionGuard,
	throwIfOperationCancelled,
	type Logger,
	type Principal,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { ErasedHookHandler } from '../authoring/declarations.js'
import type { HookContext, HookOperationKind } from '../context/hook-context.js'
import type {
	HookDiagnosticEvent,
	HookDiagnosticOwner,
	HookDiagnosticPhase,
	HookDiagnosticsObserver,
	HookDiagnosticTarget,
} from './diagnostics.js'
import type {
	HookEvent,
	HookEventHandlerInput,
	HookEventImplementation,
} from './events.js'
import {
	createRuntimeHookContext,
	type HookContextEmission,
} from './hook-context-runtime.js'
import {
	runAfterCommit,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core/plugin'

/** Supplies one stable structural identity to the shared hook executor. */
export interface HookExecutionDescriptor {
	readonly handler: ErasedHookHandler
	readonly identity: Readonly<{
		readonly declarationBranch: string
		readonly handlerIndex: number
		readonly operationKind: HookOperationKind
		readonly owner: HookDiagnosticOwner
		readonly phase: HookDiagnosticPhase
		readonly target: HookDiagnosticTarget
	}>
}

/** Creates one immutable descriptor shared by native and plugin hook paths. */
export const createHookExecutionDescriptor = ({
	declarationBranch = 'direct',
	handler,
	handlerIndex,
	operationKind,
	owner,
	phase,
	target,
}: Readonly<
	{ declarationBranch?: string; handler: ErasedHookHandler } & Omit<
		HookExecutionDescriptor['identity'],
		'declarationBranch'
	>
>): HookExecutionDescriptor =>
	immutableRecord({
		handler,
		identity: immutableRecord({
			declarationBranch,
			handlerIndex,
			operationKind,
			owner,
			phase,
			target,
		}),
	})

/** Identifies one developer-owned declaration without plugin metadata. */
export const applicationHookOwner: HookDiagnosticOwner = immutableRecord({
	kind: 'application' as const,
})

/** Creates the redacted owner shared by native and event plugin hooks. */
export const createPluginHookOwner = (
	pluginName: string,
	contributionName: string,
	pluginInstanceId?: string,
): HookDiagnosticOwner =>
	immutableRecord({
		contributionName,
		kind: 'plugin' as const,
		pluginName,
		...(pluginInstanceId === undefined ? {} : { pluginInstanceId }),
	})

/** Detaches one field path before it can enter diagnostics. */
export const createFieldHookTarget = (
	className: string,
	path: readonly string[],
): HookDiagnosticTarget =>
	immutableRecord({
		className,
		kind: 'field' as const,
		path: immutableArray(path),
	})

/** Identifies a schema without retaining its runtime object in diagnostics. */
export const createSchemaHookTarget = (
	className: string,
): HookDiagnosticTarget =>
	immutableRecord({ className, kind: 'schema' as const })

/** Identifies a global (every-schema) declaration. */
export const globalHookTarget: HookDiagnosticTarget = immutableRecord({
	kind: 'global' as const,
})

/** One event consumer with the owner that declared it. */
export interface OwnedHookEventHandler {
	readonly contributionId: string
	readonly implementation: HookEventImplementation
	/** `undefined` for consumers the application declared in `hooksPlugin({ events })`. */
	readonly owner: PluginIdentity | undefined
}

/** The request facts a post-commit invocation keeps once the transaction ended. */
export interface HookAfterCommitScope {
	readonly principal: Principal | undefined
	readonly request: RequestContext
	readonly transactionId: string | undefined
}

/** Bounds hook-issued operations nested inside each other (ADR-0318). */
export const maximumHookDepth = 16

type HookInvocationOutcome<TResult> =
	| Readonly<{ ok: true; value: TResult }>
	| Readonly<{ ok: false; error: unknown }>

// Prepared-operation contributions run while Runtime finalizes a write.
const nonQueryableHookPhases: ReadonlySet<HookDiagnosticPhase> = new Set([
	'prepared-operation',
])
const emptyHookStack: readonly HookExecutionDescriptor['identity'][] =
	immutableArray([])
const directCallbackExecutor: ApplicationCallbackExecutor = immutableRecord({
	runApplication: <TResult>(callback: () => TResult): TResult => callback(),
	runPlugin: <TResult>(_owner: PluginIdentity, callback: () => TResult) =>
		callback(),
})

/** Preserves callback and nested-query failures without duplicating one error. */
const combineHookFailures = (primary: unknown, secondary: unknown): unknown =>
	primary === secondary
		? primary
		: new AggregateError(
				[primary, secondary],
				'Hook callback and one nested query both failed.',
				{ cause: secondary },
			)

const readErrorCode = (error: unknown): HookDiagnosticEvent['errorCode'] => {
	if (!(error instanceof FrameworkError)) return undefined
	const code: unknown = error.code
	return frameworkErrorCodes.find((candidate) => candidate === code)
}

/** Names one hook frame as `Schema.operation` for the recursion message. */
const describeFrame = (
	identity: HookExecutionDescriptor['identity'],
): string => {
	const schema =
		identity.target.kind === 'global' ? '*' : identity.target.className
	const operation =
		identity.operationKind === 'plugin-schema-mutation'
			? identity.declarationBranch
			: identity.operationKind
	return `${schema}.${operation}`
}

/** Owns one application's hook stack, post-commit delivery and diagnostics. */
export class HookExecutionRuntime {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #eventHandlers: readonly OwnedHookEventHandler[]
	readonly #observer: HookDiagnosticsObserver | undefined
	readonly #logger: Logger
	readonly #storage = new AsyncLocalStorage<
		readonly HookExecutionDescriptor['identity'][]
	>()

	constructor(
		observer: HookDiagnosticsObserver | undefined,
		eventHandlers: readonly OwnedHookEventHandler[] = immutableArray([]),
		callbacks: ApplicationCallbackExecutor = directCallbackExecutor,
		logger: Logger = console,
	) {
		if (observer !== undefined && typeof observer !== 'function') {
			throw new TypeError('Hook diagnostics observer must be a function')
		}

		this.#eventHandlers = immutableArray(eventHandlers)
		this.#observer = observer
		this.#callbacks = callbacks
		this.#logger = logger
		Object.freeze(this)
	}

	/** Reports one redacted outcome outside request scope; never throws. */
	#report(
		identity: HookExecutionDescriptor['identity'],
		request: RequestContext,
		transactionId: string | undefined,
		depth: number,
		status: HookDiagnosticEvent['status'],
		startedAt: number,
		error?: unknown,
	): void {
		const observer = this.#observer
		if (observer === undefined) return
		const errorCode = readErrorCode(error)
		const event: HookDiagnosticEvent = immutableRecord({
			declarationBranch: identity.declarationBranch,
			depth,
			durationMs:
				startedAt === 0 ? 0 : Math.max(0, performance.now() - startedAt),
			handlerIndex: identity.handlerIndex,
			kind: 'hook' as const,
			operationKind: identity.operationKind,
			owner: identity.owner,
			phase: identity.phase,
			requestId: request.requestId,
			status,
			target: identity.target,
			transactionId,
			...(errorCode === undefined ? {} : { errorCode }),
		})

		// Diagnostics run outside request scope and never affect business execution.
		this.#storage.exit(() => {
			runOutsideRequestEngineScope(() => {
				try {
					void Promise.resolve(observer(event)).catch(() => undefined)
				} catch {
					// Synchronous observer failures are isolated as well.
				}
			})
		})
	}

	/** Runs one callback as its owner: the application or the contributing plugin. */
	#runAsOwner<TResult>(
		owner: HookDiagnosticOwner,
		execute: () => MaybePromise<TResult>,
	): MaybePromise<TResult> {
		return owner.kind === 'application'
			? this.#callbacks.runApplication(execute)
			: this.#callbacks.runPlugin(
					immutableRecord({
						pluginId: owner.pluginName,
						...(owner.pluginInstanceId === undefined
							? {}
							: { instanceId: owner.pluginInstanceId }),
					}),
					execute,
				)
	}

	/**
	 * Executes one handler inside the request with depth, cancellation, and
	 * telemetry invariants.
	 *
	 * Non-cancellable invocations are finalization observers that still run
	 * after cancellation has determined the outcome.
	 */
	async invoke<TResult>(
		descriptor: HookExecutionDescriptor,
		request: RequestContext,
		callback: (context: HookContext) => MaybePromise<TResult>,
		{ cancellable = true }: Readonly<{ cancellable?: boolean }> = {},
	): Promise<TResult> {
		const { identity } = descriptor
		const transactionId = getCurrentTransactionId()
		const parentStack = this.#storage.getStore() ?? emptyHookStack
		const depth = parentStack.length
		const cancellation = {
			operationKind: identity.operationKind,
			phase: identity.phase,
		}

		if (cancellable) throwIfOperationCancelled(request.signal, cancellation)

		if (depth > maximumHookDepth) {
			const chain = [...parentStack, identity].map(describeFrame).join(' -> ')
			const error = new FrameworkError(
				'RUNTIME_CALLBACK_RECURSION',
				`Hooks nested more than ${String(maximumHookDepth)} operations: ${chain}.`,
				{
					publicMessage: 'A recursive hook execution was rejected.',
					internalDetails: {
						chain,
						depth,
						reason: 'hook-depth-exceeded',
					},
				},
			)
			this.#report(identity, request, transactionId, depth, 'failed', 0, error)
			throw error
		}

		const stack = immutableArray([...parentStack, identity])
		// Core resolves the principal at most once per request (ADR-0304).
		const principal = await getRequestPrincipal(request)
		const startedAt = this.#observer === undefined ? 0 : performance.now()
		const scope = createRuntimeHookContext({
			emit: (emission) => {
				this.#emit(emission)
			},
			hook: identity,
			principal,
			queryable: !nonQueryableHookPhases.has(identity.phase),
			request,
			transactionId,
		})

		return this.#storage.run(stack, () =>
			runWithQueryExecutionGuard(scope.queryGuard, async () => {
				let outcome: HookInvocationOutcome<TResult>

				try {
					outcome = {
						ok: true,
						value: await this.#runAsOwner(identity.owner, () =>
							callback(scope.context),
						),
					}
				} catch (error: unknown) {
					outcome = { ok: false, error }
				}

				try {
					await scope.lifetime.close()
				} catch (closeError: unknown) {
					outcome = {
						ok: false,
						error: outcome.ok
							? closeError
							: combineHookFailures(outcome.error, closeError),
					}
				}

				if (outcome.ok && cancellable) {
					try {
						throwIfOperationCancelled(scope.context.signal, cancellation)
					} catch (error: unknown) {
						outcome = { ok: false, error }
					}
				}

				if (!outcome.ok) {
					const { error } = outcome
					this.#report(
						identity,
						request,
						transactionId,
						depth,
						error instanceof FrameworkError &&
							error.code === 'OPERATION_CANCELLED'
							? 'cancelled'
							: 'failed',
						startedAt,
						error,
					)
					throw error
				}

				this.#report(
					identity,
					request,
					transactionId,
					depth,
					'succeeded',
					startedAt,
				)
				return outcome.value
			}),
		)
	}

	/** Captures what a post-commit invocation needs while the request is still active. */
	async captureAfterCommitScope(
		request: RequestContext,
	): Promise<HookAfterCommitScope> {
		return immutableRecord({
			principal: await getRequestPrincipal(request),
			request,
			transactionId: getCurrentTransactionId(),
		})
	}

	/**
	 * Queues handlers to run after the current transaction commits, outside
	 * it (ADR-0318): sequentially, each failure logged without stopping the
	 * next, never delaying the response.
	 */
	queueAfterCommit<
		THandler extends Readonly<{ descriptor: HookExecutionDescriptor }>,
	>(
		handlers: readonly THandler[],
		scope: HookAfterCommitScope,
		createInput: (handler: THandler, context: HookContext) => unknown,
	): void {
		if (handlers.length === 0) return
		runAfterCommit(async () => {
			for (const handler of handlers) {
				const { descriptor } = handler
				await this.#invokeAfterCommit(descriptor, scope, (context) =>
					// Each declaration was type-checked against this exact input when authored.
					descriptor.handler(createInput(handler, context) as never),
				)
			}
		})
	}

	/** Runs one post-commit callback; queries start their own requests. */
	async #invokeAfterCommit(
		descriptor: HookExecutionDescriptor,
		scope: HookAfterCommitScope,
		callback: (context: HookContext) => MaybePromise<unknown>,
	): Promise<void> {
		const { identity } = descriptor
		const startedAt = this.#observer === undefined ? 0 : performance.now()
		const context = createRuntimeHookContext({
			emit: (emission) => {
				this.#emit(emission)
			},
			hook: identity,
			principal: scope.principal,
			queryable: true,
			request: scope.request,
			transactionId: scope.transactionId,
		})
		try {
			await this.#runAsOwner(identity.owner, () => callback(context.context))
			this.#report(
				identity,
				scope.request,
				scope.transactionId,
				0,
				'succeeded',
				startedAt,
			)
		} catch (error: unknown) {
			this.#report(
				identity,
				scope.request,
				scope.transactionId,
				0,
				'failed',
				startedAt,
				error,
			)
			// After commit nothing rolls back and the client has its answer.
			this.#logger.error(
				`A ${identity.phase} hook failed after commit (${describeFrame(identity)}, request ${scope.request.requestId}); the committed write is kept`,
				error instanceof Error ? error : { error },
			)
		} finally {
			await context.lifetime.close().catch(() => undefined)
		}
	}

	/** Queues one event's delivery after the transaction that emitted it commits. */
	#emit(emission: HookContextEmission): void {
		const transactionId = getCurrentTransactionId()
		if (transactionId === undefined) {
			throw new FrameworkError(
				'TRANSACTION_ERROR',
				'Hook events require an active transaction.',
				{
					publicMessage:
						'This hook event cannot be emitted outside a transaction.',
					internalDetails: { reason: 'hook-event-transaction-required' },
				},
			)
		}

		const handlers = this.#eventHandlers.filter(
			({ implementation }) => implementation.contract === emission.contract,
		)
		// Without a consumer an event is a no-op (ADR-0318).
		if (handlers.length === 0) return

		const event: HookEvent = immutableRecord({
			emittedBy: emission.hook,
			name: emission.name,
			payload: emission.payload,
			requestId: emission.request.requestId,
			transactionId,
		})
		const scope = immutableRecord({
			principal: emission.principal,
			request: emission.request,
			transactionId,
		})
		this.queueAfterCommit(
			handlers.map(({ contributionId, implementation, owner }) => ({
				descriptor: createHookExecutionDescriptor({
					declarationBranch: emission.name,
					handler: implementation.handler,
					handlerIndex: 0,
					operationKind: emission.hook.operationKind,
					owner:
						owner === undefined
							? applicationHookOwner
							: createPluginHookOwner(
									owner.pluginId,
									contributionId,
									owner.instanceId,
								),
					phase: 'event',
					target: globalHookTarget,
				}),
			})),
			scope,
			(_handler, context) => {
				const input: HookEventHandlerInput = immutableRecord({
					context,
					event,
				})
				return input
			},
		)
	}
}
