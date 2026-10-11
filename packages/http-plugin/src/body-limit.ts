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
 * @internal Counts body bytes as the handler reads them and fails the read
 * that crosses `limit`, so no handler sees an oversized body. A body never
 * read is never counted, so a handler that ignores it is unaffected.
 */
export const limitHttpBody = (
	body: ReadableStream<Uint8Array> | null,
	limit: number,
): Readonly<{
	readonly body: ReadableStream<Uint8Array> | null
	readonly exceeded: () => boolean
}> => {
	if (body === null) return { body, exceeded: () => false }
	const source = body.getReader()
	let received = 0
	let exceeded = false
	// Pulled only on demand, so nothing is read before the handler asks.
	const guarded = new ReadableStream<Uint8Array>(
		{
			pull: async (controller) => {
				const chunk = await source.read()
				if (chunk.done) {
					controller.close()
					return
				}
				received += chunk.value.byteLength
				if (received > limit) {
					exceeded = true
					controller.error(new HttpBodyLimitExceeded(limit))
					await source.cancel()
					return
				}
				controller.enqueue(chunk.value)
			},
			cancel: (reason: unknown) => source.cancel(reason),
		},
		{ highWaterMark: 0 },
	)
	return { body: guarded, exceeded: () => exceeded }
}
