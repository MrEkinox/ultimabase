import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import {
	FrameworkError,
	frameworkErrorCodes,
	type FrameworkErrorCode,
	type OperationKind,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { CompiledAccessRule, FieldAccessPlan } from '../authoring/plan.js'
import type {
	AccessDiagnosticEvent,
	AccessDiagnosticIdentity,
	AccessDiagnosticsObserver,
} from './diagnostics.js'
import type {
	RequestContext,
	ApplicationCallbackExecutor,
	PluginIdentity,
} from '@ultimabase/core/plugin'

export type AccessPhase =
	| 'access-field-read'
	| 'access-field-write'
	| 'access-filter'
	| 'access-item'
	| 'access-operation'

/** The Runtime terminal a rule runs for; `schema-permission` when Core asks about a permission. */
export type AccessOperationKind =
	OperationKind | 'plugin-schema-mutation' | 'schema-permission'

/** Identifies one compiled rule at one exact policy boundary. */
export interface AccessRuleIdentity {
	readonly branch: string
	readonly field?: FieldAccessPlan
	readonly phase: AccessPhase
	readonly rule: CompiledAccessRule
	readonly ruleIndex: number
	readonly schema: SchemaDefinition
}

export interface AccessExecutionDescriptor {
	readonly identity: AccessRuleIdentity
	readonly operation: AccessOperationKind
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

const createDiagnosticIdentity = ({
	identity,
	operation,
}: AccessExecutionDescriptor): AccessDiagnosticIdentity => {
	const source = identity.rule.source
	return immutableRecord({
		branch: identity.branch,
		...(identity.field === undefined
			? {}
			: { fieldPath: immutableArray(identity.field.path) }),
		operation,
		phase: identity.phase,
		ruleIndex: identity.ruleIndex,
		schema: identity.schema.className,
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

/** Keeps official Access callbacks cancellable, observable, and fail-closed. */
export class AccessExecutionRuntime {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #observer: AccessDiagnosticsObserver | undefined
	readonly #stack = new AsyncLocalStorage<
		readonly AccessExecutionDescriptor[]
	>()

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

	/** Runs one rule callback under its owner, rejecting re-entry of the same rule. */
	async invoke<TResult>(
		descriptor: AccessExecutionDescriptor,
		context: RequestContext,
		run: () => TResult | Promise<TResult>,
	): Promise<TResult> {
		context.signal.throwIfAborted()
		const parentStack = this.#stack.getStore() ?? emptyStack
		if (parentStack.some((frame) => isSameRule(frame, descriptor))) {
			throw new FrameworkError(
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
		}

		const startedAt = this.#observer === undefined ? 0 : performance.now()
		const report = (
			status: AccessDiagnosticEvent['status'],
			errorCode?: FrameworkErrorCode,
		): void => {
			const observer = this.#observer
			if (observer === undefined) return
			try {
				observer(
					immutableRecord({
						depth: parentStack.length,
						durationMs: performance.now() - startedAt,
						...(errorCode === undefined ? {} : { errorCode }),
						identity: createDiagnosticIdentity(descriptor),
						requestId: context.requestId,
						status,
					}),
				)
			} catch {
				// Diagnostic observers are deliberately unable to affect policy outcomes.
			}
		}

		try {
			const source = descriptor.identity.rule.source
			const stack = immutableArray([...parentStack, descriptor])
			const execute = () => this.#stack.run(stack, run)
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
			report('fulfilled')
			return result
		} catch (error: unknown) {
			report('failed', readErrorCode(error))
			throw error
		}
	}
}
