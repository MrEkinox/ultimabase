/**
 * Upper bound of one cookie-route JSON body. Credential payloads are small; the
 * bound matches the default of the REST and GraphQL transports.
 */
export const authBodyLimit = 1_048_576

/**
 * Parses one JSON request body without buffering more than
 * {@link authBodyLimit} bytes. `Content-Length` only rejects early; the
 * streamed byte count is the boundary. Decoding matches `Request.json()`.
 */
export const readAuthJsonBody = async (request: Request): Promise<unknown> => {
	const declaredLength = Number(request.headers.get('content-length'))
	if (declaredLength > authBodyLimit) {
		throw new RangeError('Auth request body is too large')
	}
	// Node types the body stream loosely; fetch request bodies are bytes.
	const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
		request.body?.getReader()
	if (reader === undefined) return JSON.parse('') as unknown
	const decoder = new TextDecoder()
	let length = 0
	let source = ''
	for (
		let result = await reader.read();
		!result.done;
		result = await reader.read()
	) {
		length += result.value.byteLength
		if (length > authBodyLimit) {
			await reader.cancel()
			throw new RangeError('Auth request body is too large')
		}
		source += decoder.decode(result.value, { stream: true })
	}
	return JSON.parse(source + decoder.decode()) as unknown
}
