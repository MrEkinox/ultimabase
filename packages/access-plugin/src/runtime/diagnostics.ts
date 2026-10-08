import {
	defineCapability,
	type CapabilityToken,
	type FrameworkErrorCode,
} from '@ultimabase/core'

import type { AccessOperationKind, AccessPhase } from './execution-runtime.js'

/** Describes one official Access callback without exposing executable policy state. */
export interface AccessDiagnosticIdentity {
	readonly branch: string
	readonly fieldPath?: readonly string[]
	readonly operation: AccessOperationKind
	readonly phase: AccessPhase
	readonly ruleIndex: number
	readonly schema: string
	readonly source: 'developer' | 'plugin'
	readonly sourcePlugin?: string
}

/** Reports one completed official Access callback in request-local order. */
export interface AccessDiagnosticEvent {
	readonly depth: number
	readonly durationMs: number
	readonly errorCode?: FrameworkErrorCode
	readonly identity: AccessDiagnosticIdentity
	readonly requestId: string
	readonly status: 'failed' | 'fulfilled'
}

/** Observes official Access callbacks without changing their decisions. */
export type AccessDiagnosticsObserver = (event: AccessDiagnosticEvent) => void

export type AccessDiagnosticsObserverCapability = CapabilityToken<
	AccessDiagnosticsObserver,
	AccessDiagnosticsObserver,
	'ultimabase.access.diagnostics-observer',
	'1.0.0',
	'single',
	'application'
>

/** Selects one optional application-local observer for official Access callbacks. */
export const accessDiagnosticsObserverCapability: AccessDiagnosticsObserverCapability =
	defineCapability<AccessDiagnosticsObserver>()({
		capabilityId: 'ultimabase.access.diagnostics-observer',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		providerPrivilege: 'runtime:observe',
		compose: ([provider]) => provider,
	})
