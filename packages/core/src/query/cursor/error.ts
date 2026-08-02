const queryCursorErrorCodes = ['CURSOR_INVALID', 'CURSOR_INCOMPATIBLE'] as const

/** Distinguishes malformed tokens from valid cursors for another query shape. */
export type QueryCursorErrorCode = (typeof queryCursorErrorCodes)[number]

const isQueryCursorErrorCode = (
	value: unknown,
): value is QueryCursorErrorCode =>
	typeof value === 'string' &&
	queryCursorErrorCodes.some((candidate) => candidate === value)

/** Exposes stable cursor failures without importing Core into Query. */
export class QueryCursorError<
	const TCode extends QueryCursorErrorCode = QueryCursorErrorCode,
> extends Error {
	readonly code: TCode

	constructor(code: TCode, message: string, options?: ErrorOptions) {
		if (!isQueryCursorErrorCode(code)) {
			throw new TypeError('cursor error code must be a declared code')
		}

		if (typeof message !== 'string' || message.length === 0) {
			throw new TypeError('cursor error message must be a non-empty string')
		}

		super(message, options)
		this.name = 'QueryCursorError'
		this.code = code
	}
}
