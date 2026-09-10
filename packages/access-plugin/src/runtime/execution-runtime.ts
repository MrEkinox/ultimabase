import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import {
	FrameworkError,
	frameworkErrorCodes,
	type FrameworkErrorCode,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AccessRuleIdentity } from './rule-evaluation.js'
import type { AccessOperationKind } from './rule-evaluation.js'
import type {
	AccessDiagnosticEvent,
	AccessDiagnosticIdentity,
	AccessDiagnosticsObserver,
} from './diagnostics.js'

export interface AccessExecutionDescriptor {
	readonly identity: AccessRuleIdentity
	readonly operation: AccessOperationKind
}

interface AccessExecutionState {
	readonly stack: readonly AccessExecutionDescriptor[]
}

const emptyStack: readonly AccessExecutionDescriptor[] = immutableArray([])
const directCallbackExecutor: ApplicationCallbackExecutor = immutableRecord({
	runApplication: <TResult>(callback: () => TResult): TResult => callback(),
	runPlugin: <TResult>(
		_owner: PluginIdentity,
		callback: () => TResult,
	): TResult => callback(),
})

const isSameRule = (
	left: AccessExecutionDescriptor,
	right: AccessExecutionDescriptor,
): boolean =>
	left.identity.rule === right.identity.rule &&
	left.identity.branch === right.identity.branch &&
	left.identity.phase === right.identity.phase &&
	left.identity.schema === right.identity.schema &&
	left.operation === right.operation

const createDiagnosticIdentity = (
	descriptor: AccessExecutionDescriptor,
): AccessDiagnosticIdentity => {
	const source = descriptor.identity.rule.source

	return immutableRecord({
		branch: descriptor.identity.branch,
		...(descriptor.identity.field === undefined
			? {}
			: { fieldPath: immutableArray(descriptor.identity.field.path) }),
		operation: descriptor.operation,
		phase: descriptor.identity.phase,
		ruleIndex: descriptor.identity.ruleIndex,
		schema: descriptor.identity.schema.className,
		source: source.kind,
		...(source.kind === 'developer'
			? {}
			: { sourcePlugin: source.ownerPlugin }),
	})
}

const readErrorCode = (error: unknown): FrameworkErrorCode | undefined =>
	error instanceof FrameworkError
		? frameworkErrorCodes.find((candidate) => candidate === error.code)
		: undefined

const createRecursionError = (
	descriptor: AccessExecutionDescriptor,
): FrameworkError<'RUNTIME_CALLBACK_RECURSION'> =>
	new FrameworkError(
		'RUNTIME_CALLBACK_RECURSION',
		`Recursive Access rule execution detected for ${descriptor.identity.phase}.`,
		{
			publicMessage: 'A recursive policy execution was rejected.',
			internalDetails: {
				kind: 'access-rule-recursion',
				operation: descriptor.operation,
				phase: descriptor.identity.phase,
				schema: descriptor.identity.schema.className,
			},
		},
	)

/** Keeps official Access callbacks cancellable, observable, and fail-closed. */
export class AccessExecutionRuntime {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #observer: AccessDiagnosticsObserver | undefined
	readonly #storage = new AsyncLocalStorage<AccessExecutionState>()

	constructor(
		observer?: AccessDiagnosticsObserver,
		callbacks: ApplicationCallbackExecutor = directCallbackExecutor,
	) {
		if (observer !== undefined && typeof observer !== 'function') {
			throw new TypeError('Access diagnostics observer must be a function')
		}
		this.#observer = observer
		this.#callbacks = callbacks
		Object.freeze(this)
	}

	async invoke<TResult>(
		descriptor: AccessExecutionDescriptor,
		context: RequestContext,
		run: () => TResult | Promise<TResult>,
	): Promise<TResult> {
		context.signal.throwIfAborted()
		const parentStack = this.#storage.getStore()?.stack ?? emptyStack
		if (parentStack.some((frame) => isSameRule(frame, descriptor))) {
			throw createRecursionError(descriptor)
		}

		const startedAt = this.#observer === undefined ? 0 : performance.now()
		const nextStack = immutableArray([...parentStack, descriptor])
		try {
			const source = descriptor.identity.rule.source
			const execute = () => this.#storage.run({ stack: nextStack }, run)
			const result = await (source.kind === 'developer'
				? this.#callbacks.runApplication(execute)
				: this.#callbacks.runPlugin(
						immutableRecord({
							pluginId: source.ownerPlugin,
							...(source.ownerInstanceId === undefined
								? {}
								: { instanceId: source.ownerInstanceId }),
						}),
						execute,
					))
			context.signal.throwIfAborted()
			this.#notify({
				depth: parentStack.length,
				durationMs: performance.now() - startedAt,
				identity: createDiagnosticIdentity(descriptor),
				requestId: context.requestId,
				status: 'fulfilled',
			})
			return result
		} catch (error: unknown) {
			const errorCode = readErrorCode(error)
			this.#notify({
				depth: parentStack.length,
				durationMs: performance.now() - startedAt,
				...(errorCode === undefined ? {} : { errorCode }),
				identity: createDiagnosticIdentity(descriptor),
				requestId: context.requestId,
				status: 'failed',
			})
			throw error
		}
	}

	#notify(event: AccessDiagnosticEvent): void {
		try {
			this.#observer?.(immutableRecord(event))
		} catch {
			// Diagnostic observers are deliberately unable to affect policy outcomes.
		}
	}
}
