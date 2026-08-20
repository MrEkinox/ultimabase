import type {
	RequestAccess,
	RequestCapability,
	RequestContext,
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

/** Narrows Core's richer Runtime context to the effect-free Access contract. */
export const createAccessContext = (context: RequestContext): AccessContext =>
	context
