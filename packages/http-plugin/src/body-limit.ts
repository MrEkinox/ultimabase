/** @internal Default largest request body: 1 MiB (ADR-0323). */
export const defaultHttpBodyLimit = 1_048_576

/** @internal Failure seen by a handler that reads past the body limit. */
export class HttpBodyLimitExceeded extends RangeError {
	constructor(limit: number) {
		super(`The HTTP request body exceeds ${String(limit)} bytes`)
		this.name = 'HttpBodyLimitExceeded'
	}
}

/**
 * @internal Counts body bytes as the handler reads them and fails the stream
 * past `limit`. A body never read is never counted, so a handler that ignores
 * it is unaffected.
 */
export const limitHttpBody = (
	body: ReadableStream<Uint8Array> | null,
	limit: number,
): Readonly<{
	readonly body: ReadableStream<Uint8Array> | null
	readonly exceeded: () => boolean
}> => {
	if (body === null) return { body, exceeded: () => false }
	let received = 0
	let exceeded = false
	const guarded = body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform: (chunk, controller) => {
				received += chunk.byteLength
				if (received > limit) {
					exceeded = true
					controller.error(new HttpBodyLimitExceeded(limit))
					return
				}
				controller.enqueue(chunk)
			},
		}),
	)
	return { body: guarded, exceeded: () => exceeded }
}
