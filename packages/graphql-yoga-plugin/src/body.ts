import { isPlainRecord } from '@ultimabase/shared'
import type { GraphQLError } from 'graphql'
import type { GraphQLParams } from 'graphql-yoga'

import { createGraphqlHttpFailure } from './errors.js'

const allowedKeys = new Set([
	'extensions',
	'operationName',
	'query',
	'variables',
])

const badRequest = (message: string): GraphQLError =>
	createGraphqlHttpFailure({ code: 'BAD_REQUEST', message, status: 400 })

const tooLarge = (): GraphQLError =>
	createGraphqlHttpFailure({
		code: 'PAYLOAD_TOO_LARGE',
		message: 'GraphQL request body is too large.',
		status: 413,
	})

const readBody = async (
	request: Request,
	bodyLimit: number,
): Promise<string> => {
	// Content-Length only rejects early; the streamed byte count is authoritative.
	const declaredLength = Number(
		request.headers.get('content-length') ?? Number.NaN,
	)
	if (Number.isFinite(declaredLength) && declaredLength > bodyLimit) {
		throw tooLarge()
	}
	if (request.body === null)
		throw badRequest('GraphQL request body is required.')
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let length = 0
	try {
		request.signal.throwIfAborted()
		let chunk = await reader.read()
		while (!chunk.done) {
			length += chunk.value.byteLength
			if (length > bodyLimit) {
				await reader.cancel()
				throw tooLarge()
			}
			chunks.push(chunk.value)
			request.signal.throwIfAborted()
			chunk = await reader.read()
		}
	} finally {
		reader.releaseLock()
	}
	request.signal.throwIfAborted()
	const bytes = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch {
		throw badRequest('GraphQL request body must contain valid UTF-8 JSON.')
	}
}

const normalizeParams = (value: unknown): GraphQLParams => {
	if (!isPlainRecord(value)) {
		throw badRequest('GraphQL request body must be an object.')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !allowedKeys.has(key)) {
			throw badRequest(
				`GraphQL request body contains unknown field: ${String(key)}.`,
			)
		}
	}
	if (typeof value.query !== 'string') {
		throw badRequest('GraphQL request query must be a string.')
	}
	if (
		value.operationName != null &&
		(typeof value.operationName !== 'string' ||
			value.operationName.length === 0)
	) {
		throw badRequest(
			'GraphQL request operationName must be a non-empty string or null.',
		)
	}
	if (value.variables != null && !isPlainRecord(value.variables)) {
		throw badRequest('GraphQL request variables must be an object or null.')
	}
	if (value.extensions != null) {
		if (!isPlainRecord(value.extensions)) {
			throw badRequest('GraphQL request extensions must be an object or null.')
		}
		if (Reflect.ownKeys(value.extensions).length > 0) {
			throw badRequest('GraphQL request extensions are not supported.')
		}
	}
	return {
		query: value.query,
		...(typeof value.operationName === 'string'
			? { operationName: value.operationName }
			: {}),
		...(isPlainRecord(value.variables) ? { variables: value.variables } : {}),
	}
}

/** Reads one bounded JSON request without trusting Content-Length. */
export const parseGraphqlRequestBody = async (
	request: Request,
	bodyLimit: number,
): Promise<GraphQLParams> => {
	const source = await readBody(request, bodyLimit)
	let parsed: unknown
	try {
		parsed = JSON.parse(source)
	} catch {
		throw badRequest('GraphQL request body contains invalid JSON.')
	}
	return normalizeParams(parsed)
}
