// The request that carries a push: a POST to the endpoint, which never
// follows a redirect.
import type { IncomingMessage } from 'node:http'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { posted } from './running.ts'

let close = async () => undefined
afterEach(async () => {
	await close()
	close = async () => undefined
})

interface Received {
	readonly method: string | undefined
	readonly headers: IncomingMessage['headers']
	readonly body: Buffer
}

/** A push service on a free port, answering `status` to each request. */
async function service(status: number, location?: string) {
	const received: Received[] = []
	const server = createServer((request, response) => {
		const chunks: Buffer[] = []
		request.on('data', (chunk: Buffer) => chunks.push(chunk))
		request.on('end', () => {
			received.push({
				method: request.method,
				headers: request.headers,
				body: Buffer.concat(chunks),
			})
			if (location !== undefined) response.setHeader('location', location)
			response.writeHead(status).end('answered')
		})
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	close = async () =>
		new Promise((resolve) => {
			server.close(() => resolve(undefined))
		})
	const address = server.address()
	const port =
		typeof address === 'object' && address !== null ? address.port : 0
	return { url: `http://127.0.0.1:${port}/push/1`, received }
}

describe('the network', () => {
	it('posts the body with its headers, and gives the status', async () => {
		const { url, received } = await service(201)
		const body = Buffer.from([1, 2, 3])
		expect(await posted(url, { TTL: '60', Topic: 'inbox' }, body)).toBe(201)
		expect(received).toMatchObject([
			{ method: 'POST', headers: { ttl: '60', topic: 'inbox' }, body },
		])
	})

	it('refuses a redirect', async () => {
		const { url, received } = await service(307, 'https://example.com/')
		await expect(posted(url, {}, Buffer.alloc(0))).rejects.toThrow(
			'fetch failed',
		)
		expect(received).toHaveLength(1)
	})
})
