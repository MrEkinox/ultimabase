import type { RequestAccess } from './access.js'
import type { RequestCapability } from './capability.js'
import type { RequestContextValue } from './context-value.js'

/**
 * Exposes the immutable, effect-free request surface available to Access rules.
 *
 * Runtime request contexts satisfy this contract structurally. Access deliberately
 * omits metadata, event emission, persistence, and transaction controls so policy
 * decisions can depend only on explicit request authority and typed capabilities.
 */
export interface RequestSubjectContext {
	/** Exposes the closed anonymous or audited-master Core authority. */
	readonly access: RequestAccess
	/** Correlates the decision with the originating request. */
	readonly requestId: string
	/** Propagates cooperative cancellation to asynchronous rules. */
	readonly signal: AbortSignal
	/** Identifies the transport or internal source without transport details. */
	readonly source: string
	/** Reads one optional plugin-owned request value through its exact token. */
	getValue<TValue>(token: RequestContextValue<TValue>): TValue | undefined
	/** Checks an explicit framework capability by unforgeable token identity. */
	hasCapability(capability: RequestCapability): boolean
}
