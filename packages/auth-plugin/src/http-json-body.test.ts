import { describe, expect, it } from 'vitest'

import { authBodyLimit, readAuthJsonBody } from './http-json-body.js'

const post = (
	body: NonNullable<RequestInit['body']> | null,
	headers: NonNullable<RequestInit['headers']> = {},
): Request => {
	// Streamed bodies need Node's half-duplex mode, absent from the DOM typing.
	const init = { body, duplex: 'half' as const, headers, method: 'POST' }
	return new Request('https://example.test/auth/v1/login', init)
}

/** Streams `total` bytes in fixed chunks and records how many were pulled. */
const countingStream = (
	total: number,
	chunkSize: number,
): Readonly<{ pulled: () => number; stream: ReadableStream<Uint8Array> }> => {
	let pulled = 0
	let cancelled = false
	const stream = new ReadableStream<Uint8Array>({
		cancel: () => {
			cancelled = true
		},
		pull: (controller) => {
			if (cancelled || pulled >= total) {
				controller.close()
				return
			}
			const size = Math.min(chunkSize, total - pulled)
			pulled += size
			controller.enqueue(new Uint8Array(size).fill(0x20))
		},
	})
	return { pulled: () => pulled, stream }
}

describe('readAuthJsonBody', () => {
	it('parses JSON like Request.json(), including multi-byte characters split across chunks', async () => {
		const bytes = new TextEncoder().encode('{"email":"é@example.test"}')
		const split = bytes.indexOf(0xc3) + 1
		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				controller.enqueue(bytes.slice(0, split))
				controller.enqueue(bytes.slice(split))
				controller.close()
			},
		})

		await expect(readAuthJsonBody(post(stream))).resolves.toStrictEqual({
			email: 'é@example.test',
		})
	})

	it('rejects malformed and empty bodies like Request.json()', async () => {
		await expect(readAuthJsonBody(post('{'))).rejects.toThrow(SyntaxError)
		await expect(readAuthJsonBody(post(null))).rejects.toThrow(SyntaxError)
	})

	it('accepts a body of exactly the limit', async () => {
		const body = `"${'a'.repeat(authBodyLimit - 2)}"`

		await expect(readAuthJsonBody(post(body))).resolves.toHaveLength(
			authBodyLimit - 2,
		)
	})

	it('rejects a declared Content-Length above the limit before reading', async () => {
		const request = post('{}', {
			'content-length': String(authBodyLimit + 1),
		})

		await expect(readAuthJsonBody(request)).rejects.toThrow(
			'Auth request body is too large',
		)
		expect(request.bodyUsed).toBe(false)
	})

	// Regression: the cookie routes used to buffer the whole body with
	// `request.json()`, so an unbounded upload was held in memory before parsing.
	it('stops reading and cancels a streamed body that exceeds the limit', async () => {
		const chunkSize = 64 * 1024
		const { pulled, stream } = countingStream(authBodyLimit * 8, chunkSize)

		await expect(readAuthJsonBody(post(stream))).rejects.toThrow(
			'Auth request body is too large',
		)
		expect(pulled()).toBeLessThanOrEqual(authBodyLimit + 2 * chunkSize)
	})
})
