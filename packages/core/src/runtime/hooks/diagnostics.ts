import { type FrameworkErrorCode } from '../../foundation.js'
import {
	defineCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import type { OperationKind } from '../../query/index.js'
import type { FieldHookPhase } from '../../schema/hooks/field-declarations.js'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import type {
	HookContextOwner,
	HookContextTarget,
} from '../../schema/hooks/hook-context.js'
import type { MaybePromise } from '@ultimabase/shared'

/** Identifies application declarations separately from plugin-owned hooks. */
export type HookDiagnosticOwner = HookContextOwner

/** Identifies only static schema structure and never includes business values. */
export type HookDiagnosticTarget = HookContextTarget

/** Covers native phases and the low-level contribution boundaries they wrap. */
export type HookDiagnosticPhase =
	| FieldHookPhase
	| SchemaHookPhase
	| 'after-operation'
	| 'access-field-read'
	| 'access-field-write'
	| 'access-filter'
	| 'access-item'
	| 'access-operation'
	| 'before-operation'
	| 'constraint'
	| 'guard'
	| 'event'
	| 'post-commit-event'
	| 'prepared-operation'
	| 'restrictInput'
	| 'restrictOutput'
	| 'restrictSelection'

/** Contains timing and static identity only, making it safe for metric sinks. */
export interface HookDiagnosticEvent {
	/** Identifies the redacted event category for diagnostic routing. */
	readonly kind: 'hook'
	/** Correlates the hook with the request that initiated its operation. */
	readonly requestId: string
	/** Correlates transaction-bound hooks and remains absent for standalone reads. */
	readonly transactionId: string | undefined
	/** Identifies the terminal operation observed by this hook invocation. */
	readonly operationKind: OperationKind
	/** Identifies the hook lifecycle phase without exposing its callback. */
	readonly phase: HookDiagnosticPhase
	/** Identifies application or plugin ownership using static names only. */
	readonly owner: HookDiagnosticOwner
	/** Identifies the schema, field path, or global scope without business values. */
	readonly target: HookDiagnosticTarget
	/** Identifies the direct or family branch where the callback was declared. */
	readonly declarationBranch: string
	/** Gives the callback position within its original declaration branch. */
	readonly handlerIndex: number
	/** Counts active parent hooks in the current asynchronous execution branch. */
	readonly depth: number
	/** Measures callback execution with a monotonic clock in milliseconds. */
	readonly durationMs: number
	/** Reports the isolated outcome without retaining an error object. */
	readonly status: 'cancelled' | 'failed' | 'succeeded'
	/** Exposes a stable code only when the callback failed with a FrameworkError. */
	readonly errorCode?: FrameworkErrorCode
}

/** Receives best-effort redacted hook telemetry outside request authority scope. */
export type HookDiagnosticsObserver = (
	event: HookDiagnosticEvent,
) => MaybePromise<void>

/** Lets one optional plugin provide the application-wide diagnostic sink. */
export const hookDiagnosticsObserverCapability: CapabilityToken<
	HookDiagnosticsObserver,
	HookDiagnosticsObserver,
	'ultimabase.hook-diagnostics-observer',
	'1.0.0',
	'single',
	'application'
> = defineCapability<HookDiagnosticsObserver>()({
	capabilityId: 'ultimabase.hook-diagnostics-observer',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})
