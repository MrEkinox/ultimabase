import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import {
	deferCurrentTransactionEffect,
	FrameworkError,
	frameworkErrorCodes,
	getCurrentTransactionId,
	getRequestPrincipal,
	PublicError,
	runOutsideRequestEngineScope,
	runWithQueryExecutionGuard,
	throwIfOperationCancelled,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
	type RequestContext,
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

/** Detaches one field path before it can enter diagnostics or recursion keys. */
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

const globalHookTarget: HookDiagnosticTarget = immutableRecord({
	kind: 'global' as const,
})

export interface OwnedHookEventHandler {
	readonly contributionId: string
	readonly implementation: HookEventImplementation
	readonly owner: PluginIdentity
}

interface HookExecutionFrame {
	readonly identity: HookExecutionDescriptor['identity']
	readonly key: string
}

type HookInvocationOutcome<TResult> =
	| Readonly<{ ok: true; value: TResult }>
	| Readonly<{ ok: false; error: unknown }>

// Transaction-finalization phases stay non-queryable even if async scope changes.
const nonQueryableHookPhases: ReadonlySet<HookDiagnosticPhase> = new Set([
	'event',
	'post-commit-event',
	'prepared-operation',
])
const emptyHookStack: readonly HookExecutionFrame[] = immutableArray([])
const directCallbackExecutor: ApplicationCallbackExecutor = immutableRecord({
	runApplication: <TResult>(callback: () => TResult): TResult => callback(),
	runPlugin: <TResult>(_owner: PluginIdentity, callback: () => TResult) =>
		callback(),
})

/** Keeps recursion identity stable when one broad declaration handles many terminals. */
const createHookExecutionKey = (
	identity: HookExecutionDescriptor['identity'],
): string =>
	JSON.stringify([
		identity.owner,
		identity.target,
		identity.phase,
		identity.declarationBranch,
		identity.handlerIndex,
	])

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

const transactionError = (
	message: string,
	publicMessage: string,
	reason: string,
	cause?: unknown,
): FrameworkError<'TRANSACTION_ERROR'> =>
	new FrameworkError('TRANSACTION_ERROR', message, {
		...(cause === undefined ? {} : { cause }),
		publicMessage,
		internalDetails: { reason },
	})

/** Owns one application's immutable hook stack and safe diagnostic observer. */
export class HookExecutionRuntime {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #eventHandlers: readonly OwnedHookEventHandler[]
	readonly #observer: HookDiagnosticsObserver | undefined
	readonly #storage = new AsyncLocalStorage<readonly HookExecutionFrame[]>()

	constructor(
		observer: HookDiagnosticsObserver | undefined,
		eventHandlers: readonly OwnedHookEventHandler[] = immutableArray([]),
		callbacks: ApplicationCallbackExecutor = directCallbackExecutor,
	) {
		if (observer !== undefined && typeof observer !== 'function') {
			throw new TypeError('Hook diagnostics observer must be a function')
		}

		this.#eventHandlers = immutableArray(eventHandlers)
		this.#observer = observer
		this.#callbacks = callbacks
		Object.freeze(this)
	}

	/**
	 * Executes one handler with recursion, cancellation, and telemetry invariants.
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
		const key = createHookExecutionKey(identity)
		const cancellation = {
			operationKind: identity.operationKind,
			phase: identity.phase,
		}
		const report = (
			status: HookDiagnosticEvent['status'],
			startedAt: number,
			error?: unknown,
		): void => {
			const observer = this.#observer
			if (observer === undefined) return
			const errorCode = readErrorCode(error)
			const event: HookDiagnosticEvent = immutableRecord({
				declarationBranch: identity.declarationBranch,
				depth: parentStack.length,
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

		if (cancellable) throwIfOperationCancelled(request.signal, cancellation)

		if (parentStack.some((frame) => frame.key === key)) {
			const error = new FrameworkError(
				'RUNTIME_CALLBACK_RECURSION',
				`Recursive hook execution detected for ${identity.phase}.`,
				{
					publicMessage: 'A recursive hook execution was rejected.',
					internalDetails: {
						hook: identity,
						reason: 'same-hook-recursion',
						stack: immutableArray([
							...parentStack.map((frame) => frame.identity),
							identity,
						]),
					},
				},
			)
			report('failed', 0, error)
			throw error
		}

		const stack = immutableArray([
			...parentStack,
			immutableRecord({ identity, key }),
		])
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
				const execute = () => callback(scope.context)
				const { owner } = identity

				try {
					outcome = {
						ok: true,
						value: await (owner.kind === 'application'
							? this.#callbacks.runApplication(execute)
							: this.#callbacks.runPlugin(
									immutableRecord({
										pluginId: owner.pluginName,
										...(owner.pluginInstanceId === undefined
											? {}
											: { instanceId: owner.pluginInstanceId }),
									}),
									execute,
								)),
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
					report(
						error instanceof FrameworkError &&
							error.code === 'OPERATION_CANCELLED'
							? 'cancelled'
							: 'failed',
						startedAt,
						error,
					)
					throw error
				}

				report('succeeded', startedAt)
				return outcome.value
			}),
		)
	}

	/** Queues one named event on the exact transaction inherited by this hook. */
	#emit(emission: HookContextEmission): void {
		const transactionId = getCurrentTransactionId()

		if (transactionId === undefined) {
			throw transactionError(
				'Hook events require an active transaction.',
				'This hook event cannot be emitted outside a transaction.',
				'hook-event-transaction-required',
			)
		}

		const handlers = this.#eventHandlers.filter(
			({ implementation }) => implementation.name === emission.name,
		)

		if (handlers.length === 0) {
			// Optional notifications do not allocate an empty post-commit effect.
			if (emission.delivery === 'optional') return

			throw new FrameworkError(
				'SERVICE_NOT_FOUND',
				`No hook event consumer is registered for "${emission.name}".`,
				{
					publicMessage: 'The emitted hook event has no consumer.',
					internalDetails: {
						eventName: emission.name,
						reason: 'hook-event-consumer-missing',
					},
				},
			)
		}

		const event: HookEvent = immutableRecord({
			emittedBy: emission.hook,
			name: emission.name,
			payload: emission.payload,
			requestId: emission.request.requestId,
			transactionId,
		})

		try {
			deferCurrentTransactionEffect(() =>
				this.#dispatchEvent(event, emission.request, handlers),
			)
		} catch (cause: unknown) {
			throw transactionError(
				'Hook event cannot be queued during this transaction phase.',
				'The hook event cannot be queued now.',
				'hook-event-queue-closed',
				cause,
			)
		}
	}

	/** Delivers one committed event to every matching plugin in graph order. */
	async #dispatchEvent(
		event: HookEvent,
		request: RequestContext,
		handlers: readonly OwnedHookEventHandler[],
	): Promise<void> {
		const failures: unknown[] = []

		for (const { contributionId, owner, implementation } of handlers) {
			const descriptor = createHookExecutionDescriptor({
				handler: () => undefined,
				handlerIndex: 0,
				operationKind: event.emittedBy.operationKind,
				owner: createPluginHookOwner(
					owner.pluginId,
					contributionId,
					owner.instanceId,
				),
				phase: 'event',
				target: globalHookTarget,
			})

			try {
				await this.invoke(
					descriptor,
					request,
					(context) => {
						const input: HookEventHandlerInput = immutableRecord({
							context,
							event,
						})
						// The opaque definition retains the exact payload type at declaration time.
						return implementation.handler(input as never)
					},
					{ cancellable: false },
				)
			} catch (error: unknown) {
				if (error instanceof PublicError) {
					// After commit a PublicError is only logged (ADR-0305).
					console.error(
						'[UltimaBase] A PublicError thrown after commit was logged, not sent to the client',
						error,
					)
					continue
				}
				// A committed consumer failure cannot suppress independent siblings.
				failures.push(error)
			}
		}

		// Preserves independent consumer failures in stable handler order.
		if (failures.length === 1) throw failures[0]
		if (failures.length > 1) {
			throw new AggregateError(
				failures,
				'Multiple hook event consumers failed.',
				{ cause: failures[0] },
			)
		}
	}
}
