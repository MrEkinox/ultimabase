import type {
	RequestAccess,
	RequestCapability,
	RequestContextValue,
} from '@ultimabase/core'

/** Exposes only deterministic request authority to official Access rules. */
export interface AccessContext {
	readonly access: RequestAccess
	readonly requestId: string
	readonly signal: AbortSignal
	readonly source: string
	getValue<TValue>(token: RequestContextValue<TValue>): TValue | undefined
	hasCapability(capability: RequestCapability): boolean
}
