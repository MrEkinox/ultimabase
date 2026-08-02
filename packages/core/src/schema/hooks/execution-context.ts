/**
 * Exposes safe execution identity to every hook without revealing request
 * authority, credentials, adapters, or transaction lifecycle controls.
 *
 * Issue 340 will provide the richer `HookContext` class through this same
 * `context` property, so hook declarations do not need a transitional API.
 */
export interface HookExecutionContext {
	/** Stable identifier shared by every operation in the originating request. */
	readonly requestId: string
	/** Framework-owned identifier shared by one explicit or automatic transaction. */
	readonly transactionId: string | undefined
	/** Cooperative cancellation signal inherited from the originating request. */
	readonly signal: AbortSignal
}
