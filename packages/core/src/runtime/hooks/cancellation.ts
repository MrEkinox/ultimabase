import { FrameworkError } from '../../foundation.js'

/** Recognizes native timeout aborts without copying their environment-owned reason. */
const isTimeoutAbort = (reason: unknown): boolean =>
	reason instanceof Error && reason.name === 'TimeoutError'

/** Converts AbortSignal state into one transport-neutral framework failure. */
export const throwIfOperationCancelled = (
	signal: AbortSignal,
	internalDetails: Readonly<Record<string, unknown>> = {},
): void => {
	if (!signal.aborted) {
		return
	}

	throw new FrameworkError(
		'OPERATION_CANCELLED',
		'Operation execution was cancelled.',
		{
			publicMessage: 'The operation was cancelled.',
			internalDetails: {
				...internalDetails,
				reason: isTimeoutAbort(signal.reason)
					? 'deadline-exceeded'
					: 'request-aborted',
			},
		},
	)
}
