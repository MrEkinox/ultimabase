import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import {
	FrameworkError,
	frameworkErrorCodes,
	type FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import type {
	HookContext,
	HookExecutionContext,
	SchemaDefinition,
} from '../../schema/index.js'
import { runWithQueryExecutionGuard } from '../../query/operations/execution.js'
import { readApplicationCapability } from '../../plugins/application-capability-access.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import {
	assertApplicationPluginPrivilege,
	readApplicationEventContributions,
	type OwnedPluginContribution,
} from '../../plugins/setup-registries.js'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { runOutsideRequestEngineScope } from '../context/active-framework-storage.js'
import type { RequestContext } from '../context/request-context.js'
import {
	deferCurrentTransactionEffect,
	getCurrentTransactionId,
} from '../transactions/transaction-execution-storage.js'
import { throwIfOperationCancelled } from './cancellation.js'
import {
	hookDiagnosticsObserverCapability,
	type HookDiagnosticEvent,
	type HookDiagnosticPhase,
	type HookDiagnosticsObserver,
} from './diagnostics.js'
import type { HookExecutionDescriptor } from './execution-descriptor.js'
import {
	createHookExecutionDescriptor,
	createPluginHookOwner,
	globalHookTarget,
} from './execution-descriptor.js'
import {
	getHookEventImplementation,
	type HookEvent,
	type HookEventHandlerInput,
	type HookEventImplementation,
} from './events.js'
import {
	createRuntimeHookContext,
	type HookContextEmission,
} from './hook-context-runtime.js'

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

const queryableHookPhases: ReadonlySet<HookDiagnosticPhase> = new Set([
	'access-field-read',
	'access-field-write',
	'access-filter',
	'access-item',
	'access-operation',
	'afterCreate',
	'afterDelete',
	'afterUpdate',
	'afterUpsert',
	'after-operation',
	'beforeCreate',
	'beforeDelete',
	'beforeUpdate',
	'before-operation',
	'constraint',
	'guard',
	'resolveInput',
	'restrictInput',
	'restrictOutput',
	'restrictSelection',
])

/** Keeps transaction-finalization phases non-queryable even if async scope changes. */
const isHookQueryAllowed = (descriptor: HookExecutionDescriptor): boolean =>
	queryableHookPhases.has(descriptor.identity.phase)

const emptyHookStack: readonly HookExecutionFrame[] = immutableArray([])
const runtimesByApplication = new WeakMap<object, HookExecutionRuntime>()

const createExecutionCorrelation = (
	request: RequestContext,
): HookExecutionContext =>
	immutableRecord({
		requestId: request.requestId,
		signal: request.signal,
		transactionId: getCurrentTransactionId(),
	})

interface OwnedHookEventHandler {
	readonly contribution: OwnedPluginContribution
	readonly implementation: HookEventImplementation
}

type HookInvocationOutcome<TResult> =
	| Readonly<{ readonly status: 'fulfilled'; readonly value: TResult }>
	| Readonly<{ readonly error: unknown; readonly status: 'rejected' }>

/** Preserves callback and nested-query failures without duplicating one error. */
const combineHookFailures = (
	primaryError: unknown,
	secondaryError: unknown,
): unknown =>
	primaryError === secondaryError
		? primaryError
		: new AggregateError(
				[primaryError, secondaryError],
				'Hook callback and one nested query both failed.',
				{ cause: secondaryError },
			)

/** Preserves independent post-commit consumer failures in stable handler order. */
const throwEventFailures = (failures: readonly unknown[]): void => {
	if (failures.length === 1) {
		throw failures[0]
	}

	if (failures.length > 1) {
		throw new AggregateError(
			failures,
			'Multiple hook event consumers failed.',
			{ cause: failures[0] },
		)
	}
}

/** Compiles named event consumers once in deterministic contribution order. */
const collectHookEventHandlers = (
	application:
		| FrameworkApplication<
				readonly SchemaDefinition[],
				readonly PluginDefinition[]
		  >
		| undefined,
): readonly OwnedHookEventHandler[] => {
	if (application === undefined) {
		return immutableArray([])
	}

	const handlers: OwnedHookEventHandler[] = []

	for (const contribution of readApplicationEventContributions(application)) {
		const implementation = getHookEventImplementation(contribution.value)

		if (implementation !== undefined) {
			handlers.push(immutableRecord({ contribution, implementation }))
		}
	}

	return immutableArray(handlers)
}

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
	readonly #assertEventPublish: ((owner: PluginIdentity) => void) | undefined
	readonly #eventHandlers: readonly OwnedHookEventHandler[]
	readonly #observer: HookDiagnosticsObserver | undefined
	readonly #storage = new AsyncLocalStorage<HookExecutionState>()

	constructor(
		observer: HookDiagnosticsObserver | undefined,
		application?: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		if (observer !== undefined && typeof observer !== 'function') {
			throw new TypeError('Hook diagnostics observer must be a function')
		}

		this.#eventHandlers = collectHookEventHandlers(application)
		this.#assertEventPublish =
			application === undefined
				? undefined
				: (owner): void => {
						assertApplicationPluginPrivilege(
							application,
							owner,
							'event:publish',
						)
					}
		this.#observer = observer
		Object.freeze(this)
	}

	/** Executes one handler with recursion, cancellation, and telemetry invariants. */
	async invoke<TResult>(
		descriptor: HookExecutionDescriptor,
		request: RequestContext,
		callback: (context: HookContext) => MaybePromise<TResult>,
		options: HookInvocationOptions = {},
	): Promise<TResult> {
		const cancellable = options.cancellable ?? true
		const correlation = createExecutionCorrelation(request)
		const parentStack = this.#storage.getStore()?.stack ?? emptyHookStack

		if (cancellable) {
			throwIfOperationCancelled(correlation.signal, {
				operationKind: descriptor.identity.operationKind,
				phase: descriptor.identity.phase,
			})
		}

		if (parentStack.some(({ key }) => key === descriptor.key)) {
			const recursionError = createRecursionError(descriptor, parentStack)

			this.#notify(
				this.#createDiagnosticEvent(
					descriptor,
					correlation,
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
		const contextScope = createRuntimeHookContext({
			emit: (emission) => {
				this.#emit(emission)
			},
			hook: descriptor.identity,
			queryable: isHookQueryAllowed(descriptor),
			request,
			transactionId: correlation.transactionId,
		})

		return this.#storage.run({ stack: nextStack }, () =>
			runWithQueryExecutionGuard(contextScope.queryGuard, async () => {
				let outcome: HookInvocationOutcome<TResult>

				try {
					outcome = immutableRecord({
						status: 'fulfilled' as const,
						value: await callback(contextScope.context),
					})
				} catch (error: unknown) {
					outcome = immutableRecord({ error, status: 'rejected' as const })
				}

				try {
					await contextScope.lifetime.close()
				} catch (closeError: unknown) {
					outcome =
						outcome.status === 'rejected'
							? immutableRecord({
									error: combineHookFailures(outcome.error, closeError),
									status: 'rejected' as const,
								})
							: immutableRecord({
									error: closeError,
									status: 'rejected' as const,
								})
				}

				if (outcome.status === 'fulfilled' && cancellable) {
					try {
						throwIfOperationCancelled(contextScope.context.signal, {
							operationKind: descriptor.identity.operationKind,
							phase: descriptor.identity.phase,
						})
					} catch (error: unknown) {
						outcome = immutableRecord({ error, status: 'rejected' as const })
					}
				}

				if (outcome.status === 'rejected') {
					const { error } = outcome
					const status =
						error instanceof FrameworkError &&
						error.code === 'OPERATION_CANCELLED'
							? 'cancelled'
							: 'failed'

					this.#notify(
						this.#createDiagnosticEvent(
							descriptor,
							contextScope.context,
							parentStack.length,
							startedAt,
							status,
							error,
						),
					)
					throw error
				}

				this.#notify(
					this.#createDiagnosticEvent(
						descriptor,
						contextScope.context,
						parentStack.length,
						startedAt,
						'succeeded',
					),
				)

				return outcome.value
			}),
		)
	}

	/** Queues one named event on the exact transaction inherited by this hook. */
	#emit(emission: HookContextEmission): void {
		const owner = emission.hook.owner
		if (owner.kind === 'plugin') {
			this.#assertEventPublish?.({
				pluginId: owner.pluginName,
				...(owner.pluginInstanceId === undefined
					? {}
					: { instanceId: owner.pluginInstanceId }),
			})
		}

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
			throw new FrameworkError(
				'TRANSACTION_ERROR',
				'Hook event cannot be queued during this transaction phase.',
				{
					cause,
					publicMessage: 'The hook event cannot be queued now.',
					internalDetails: { reason: 'hook-event-queue-closed' },
				},
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

		for (const { contribution, implementation } of handlers) {
			const descriptor = createHookExecutionDescriptor({
				handler: () => undefined,
				handlerIndex: 0,
				operationKind: event.emittedBy.operationKind,
				owner: createPluginHookOwner(
					contribution.ownerPlugin,
					contribution.name,
					contribution.ownerInstanceId,
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
				// A committed consumer failure cannot suppress independent siblings.
				failures.push(error)
			}
		}

		throwEventFailures(failures)
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
		readApplicationCapability(application, hookDiagnosticsObserverCapability),
		application,
	)

	runtimesByApplication.set(application, runtime)

	return runtime
}
