import {
	restReadErrorCodes,
	RestReadNormalizationError,
	invalidRestRead,
} from './errors.js'

export interface RestJsonBodyErrors {
	readonly bodyTooLarge: () => Error
	readonly invalidInput: () => Error
	readonly unsupportedMediaType: () => Error
}

const readBodyErrors: RestJsonBodyErrors = {
	bodyTooLarge: () =>
		new RestReadNormalizationError(restReadErrorCodes.bodyTooLarge),
	invalidInput: invalidRestRead,
	unsupportedMediaType: () =>
		new RestReadNormalizationError(restReadErrorCodes.unsupportedMediaType),
}

const contentLengthPattern = /^(?:0|[1-9]\d*)$/u

const assertJsonContentType = (
	value: string | null,
	errors: RestJsonBodyErrors,
): void => {
	if (value === null) {
		throw errors.unsupportedMediaType()
	}

	const [mediaType, ...parameters] = value
		.split(';')
		.map((part) => part.trim().toLowerCase())
	if (mediaType !== 'application/json' || parameters.length > 1) {
		throw errors.unsupportedMediaType()
	}
	if (
		parameters.length === 1 &&
		parameters[0] !== 'charset=utf-8' &&
		parameters[0] !== 'charset="utf-8"'
	) {
		throw errors.unsupportedMediaType()
	}
}

const readContentLength = (
	request: Request,
	maximum: number,
	errors: RestJsonBodyErrors,
): number | undefined => {
	const value = request.headers.get('content-length')
	if (value === null) return undefined
	if (!contentLengthPattern.test(value)) throw errors.invalidInput()
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed)) throw errors.invalidInput()
	if (parsed > maximum) {
		throw errors.bodyTooLarge()
	}
	return parsed
}

const concatenate = (
	chunks: readonly Uint8Array[],
	length: number,
): Uint8Array => {
	const result = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		result.set(chunk, offset)
		offset += chunk.byteLength
	}
	return result
}

/** Consumes one JSON body while enforcing its streamed byte count before parsing. */
export const readRestJsonBody = async (
	request: Request,
	maximum: number,
	errors: RestJsonBodyErrors = readBodyErrors,
): Promise<unknown> => {
	request.signal.throwIfAborted()
	assertJsonContentType(request.headers.get('content-type'), errors)
	const declaredLength = readContentLength(request, maximum, errors)
	if (
		declaredLength !== undefined &&
		request.headers.has('transfer-encoding')
	) {
		throw errors.invalidInput()
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
				throw errors.bodyTooLarge()
			}
			chunks.push(result.value)
		}
	}
	request.signal.throwIfAborted()

	if (declaredLength !== undefined && declaredLength !== length) {
		throw errors.invalidInput()
	}

	let source: string
	try {
		source = new TextDecoder('utf-8', { fatal: true }).decode(
			concatenate(chunks, length),
		)
	} catch {
		throw errors.invalidInput()
	}
	if (source.length === 0) throw errors.invalidInput()

	try {
		return JSON.parse(source) as unknown
	} catch {
		throw errors.invalidInput()
	}
}
