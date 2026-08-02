/**
 * Defines the durable minimal execution identity implemented by HookContext.
 *
 * Consumers needing only correlation and cancellation may depend on this
 * interface without acquiring query or event capabilities.
 */
export interface HookExecutionContext {
	/** Stable identifier shared by every operation in the originating request. */
	readonly requestId: string
	/** Framework-owned identifier shared by one explicit or automatic transaction. */
	readonly transactionId: string | undefined
	/** Cooperative cancellation signal inherited from the originating request. */
	readonly signal: AbortSignal
}
