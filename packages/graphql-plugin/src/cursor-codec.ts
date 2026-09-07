import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import { GraphqlInvalidCursorError } from './connection-errors.js'

const base64urlPattern = /^[0-9A-Z_a-z-]+$/u
const fingerprintPattern = /^[0-9a-f]{64}$/u
const cursorPayloadKeys = new Set([
	'fingerprint',
	'offset',
	'path',
	'type',
	'v',
])
const maximumCursorLength = 4096
const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Identifies one root or nested relationship connection representation. */
export interface GraphqlCursorScope {
	readonly relationPath: readonly string[]
	readonly typeName: string
}

const assertScope = (scope: GraphqlCursorScope): void => {
	if (
		typeof scope.typeName !== 'string' ||
		scope.typeName === '' ||
		!isUnknownArray(scope.relationPath) ||
		!scope.relationPath.every(
			(segment) => typeof segment === 'string' && segment !== '',
		)
	) {
		throw new TypeError('GraphQL cursor scope is malformed')
	}
}

const decodeSegment = (segment: string): Buffer => {
	if (!base64urlPattern.test(segment)) throw new GraphqlInvalidCursorError()
	try {
		const bytes = Buffer.from(segment, 'base64url')
		if (bytes.toString('base64url') !== segment) {
			throw new GraphqlInvalidCursorError()
		}
		return bytes
	} catch (error: unknown) {
		if (error instanceof GraphqlInvalidCursorError) throw error
		throw new GraphqlInvalidCursorError()
	}
}

/** Owns one application-lifetime HMAC key for GraphQL cursor integrity. */
export class GraphqlCursorCodec {
	readonly #key: Buffer
	#disposed = false

	constructor(key: Uint8Array = randomBytes(32)) {
		if (key.byteLength !== 32) {
			throw new RangeError('GraphQL cursor key must contain exactly 32 bytes')
		}
		this.#key = Buffer.from(key)
	}

	#assertActive(): void {
		if (this.#disposed) {
			throw new TypeError('GraphQL cursor codec has been disposed')
		}
	}

	#tag(payload: string): Buffer {
		this.#assertActive()
		return createHmac('sha256', this.#key).update(payload, 'ascii').digest()
	}

	encode(
		scope: GraphqlCursorScope,
		fingerprint: string,
		offset: number,
	): string {
		assertScope(scope)
		if (!fingerprintPattern.test(fingerprint)) {
			throw new TypeError('GraphQL cursor fingerprint is malformed')
		}
		if (!Number.isSafeInteger(offset) || offset < 0) {
			throw new RangeError(
				'GraphQL cursor offset must be non-negative and safe',
			)
		}
		const payload = Buffer.from(
			JSON.stringify({
				v: 1,
				type: scope.typeName,
				path: scope.relationPath,
				fingerprint,
				offset,
			}),
			'utf8',
		).toString('base64url')
		return `${payload}.${this.#tag(payload).toString('base64url')}`
	}

	decode(
		cursor: unknown,
		scope: GraphqlCursorScope,
		fingerprint: string,
	): number {
		this.#assertActive()
		assertScope(scope)
		if (
			typeof cursor !== 'string' ||
			cursor.length === 0 ||
			cursor.length > maximumCursorLength
		) {
			throw new GraphqlInvalidCursorError()
		}
		const segments = cursor.split('.')
		if (segments.length !== 2) throw new GraphqlInvalidCursorError()
		const [payloadSegment, tagSegment] = segments
		if (payloadSegment === undefined || tagSegment === undefined) {
			throw new GraphqlInvalidCursorError()
		}
		const tag = decodeSegment(tagSegment)
		const expectedTag = this.#tag(payloadSegment)
		if (tag.byteLength !== expectedTag.byteLength) {
			throw new GraphqlInvalidCursorError()
		}
		if (!timingSafeEqual(tag, expectedTag)) {
			throw new GraphqlInvalidCursorError()
		}
		const payloadBytes = decodeSegment(payloadSegment)
		let payload: unknown
		try {
			payload = JSON.parse(utf8.decode(payloadBytes))
		} catch {
			throw new GraphqlInvalidCursorError()
		}
		if (
			!isPlainRecord(payload) ||
			Reflect.ownKeys(payload).some(
				(key) => typeof key !== 'string' || !cursorPayloadKeys.has(key),
			) ||
			Object.keys(payload).length !== cursorPayloadKeys.size ||
			payload.v !== 1 ||
			payload.type !== scope.typeName ||
			payload.fingerprint !== fingerprint ||
			!isUnknownArray(payload.path) ||
			payload.path.length !== scope.relationPath.length ||
			!payload.path.every(
				(segment, index) => segment === scope.relationPath[index],
			) ||
			typeof payload.offset !== 'number' ||
			!Number.isSafeInteger(payload.offset) ||
			payload.offset < 0
		) {
			throw new GraphqlInvalidCursorError()
		}
		return payload.offset
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#key.fill(0)
	}
}
