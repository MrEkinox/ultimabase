import type { RestFailure } from './errors.js'

const isUtf8Charset = (parameter: string | undefined): boolean =>
	parameter === 'charset=utf-8' || parameter === 'charset="utf-8"'

const readContentLength = (
	request: Request,
	maximum: number,
	fail: RestFailure,
): number | undefined => {
	const value = request.headers.get('content-length')
	if (value === null) return undefined
	if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw fail()
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed)) throw fail()
	if (parsed > maximum) throw fail('bodyTooLarge')
	return parsed
}

/**
 * Consumes one JSON body while enforcing its streamed byte count before parsing.
 * `Content-Length` is only a checked hint; the observed stream is the boundary.
 */
export const readRestJsonBody = async (
	request: Request,
	maximum: number,
	fail: RestFailure,
): Promise<unknown> => {
	request.signal.throwIfAborted()
	const [mediaType, ...parameters] = (request.headers.get('content-type') ?? '')
		.split(';')
		.map((part) => part.trim().toLowerCase())
	if (
		mediaType !== 'application/json' ||
		parameters.length > 1 ||
		(parameters.length === 1 && !isUtf8Charset(parameters[0]))
	) {
		throw fail('unsupportedMediaType')
	}
	const declaredLength = readContentLength(request, maximum, fail)
	if (
		declaredLength !== undefined &&
		request.headers.has('transfer-encoding')
	) {
		throw fail()
	}

	const chunks: Uint8Array[] = []
	let length = 0
	const reader = request.body?.getReader()
	if (reader !== undefined) {
		for (
			let result = await reader.read();
			!result.done;
			result = await reader.read()
		) {
			request.signal.throwIfAborted()
			length += result.value.byteLength
			if (length > maximum) {
				await reader.cancel()
				throw fail('bodyTooLarge')
			}
			chunks.push(result.value)
		}
	}
	request.signal.throwIfAborted()
	if (declaredLength !== undefined && declaredLength !== length) throw fail()

	try {
		const source = new TextDecoder('utf-8', { fatal: true }).decode(
			Buffer.concat(chunks, length),
		)
		if (source.length === 0) throw fail()
		return JSON.parse(source) as unknown
	} catch {
		throw fail()
	}
}

/** Drains a body that must be absent, rejecting any byte or body header. */
export const assertEmptyRestBody = async (
	request: Request,
	fail: RestFailure,
): Promise<void> => {
	const contentLength = request.headers.get('content-length')
	if (
		request.headers.has('content-type') ||
		request.headers.has('transfer-encoding') ||
		(contentLength !== null && contentLength !== '0')
	) {
		throw fail()
	}
	const reader = request.body?.getReader()
	if (reader === undefined) return
	for (
		let result = await reader.read();
		!result.done;
		result = await reader.read()
	) {
		request.signal.throwIfAborted()
		if (result.value.byteLength > 0) {
			await reader.cancel()
			throw fail()
		}
	}
}
