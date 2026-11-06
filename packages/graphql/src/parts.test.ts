// A socket's messages in parts (D-254): whole and in order for the client, and
// a ping reaches it before a big message ends.
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { inParts } from './parts.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

/** A compressing server's socket and its client, connected. */
async function connected() {
	const server = new WebSocketServer({
		port: 0,
		perMessageDeflate: { threshold: 1024 },
	})
	await new Promise((listening) => server.once('listening', listening))
	const address = server.address()
	if (address === null || typeof address === 'string')
		throw new Error('No port.')
	const accepted = new Promise<WebSocket>((resolve) => {
		server.once('connection', resolve)
	})
	const client = new WebSocket(`ws://127.0.0.1:${address.port}`)
	const socket = await accepted
	await new Promise((open) => client.once('open', open))
	stop = async () => {
		client.terminate()
		socket.terminate()
		await new Promise((closed) => server.close(closed))
	}
	return { socket, client }
}

// Takes many parts, with characters a byte split would cut.
const big = 'é🙂a'.repeat(200_000)

/** A socket holding each part until `release`, as a slow client makes it. */
function held() {
	const parts: { readonly size: number; readonly fin: boolean }[] = []
	let release: ((error?: Error) => void) | undefined
	return {
		parts,
		release: (error?: Error) => {
			release?.(error)
		},
		socket: {
			send: (
				data: Buffer,
				options: { readonly fin: boolean },
				written: (error?: Error | null) => void,
			) => {
				parts.push({ size: data.length, fin: options.fin })
				release = written
			},
		},
	}
}

describe('a message in parts', () => {
	it('arrives whole, as text, in order', async () => {
		const { socket, client } = await connected()
		const received: { readonly text: string; readonly binary: boolean }[] = []
		const both = new Promise<void>((done) => {
			client.on('message', (data: Buffer, binary) => {
				received.push({ text: data.toString(), binary })
				if (received.length === 3) done()
			})
		})
		const parts = inParts(socket)
		const written: number[] = []
		parts.send(big, () => written.push(1))
		parts.send('', () => written.push(2))
		parts.send('small', () => written.push(3))
		await both
		expect(received).toEqual([
			{ text: big, binary: false },
			{ text: '', binary: false },
			{ text: 'small', binary: false },
		])
		await expect.poll(() => written).toEqual([1, 2, 3])
		expect(parts.unsent()).toBe(0)
	})

	it('lets a ping through before a big message ends', async () => {
		const { socket, client } = await connected()
		const order: string[] = []
		const ended = new Promise<void>((done) => {
			client.on('ping', () => order.push('ping'))
			client.on('message', () => {
				order.push('message')
				done()
			})
		})
		inParts(socket).send(big, () => undefined)
		socket.ping()
		await ended
		expect(order).toEqual(['ping', 'message'])
	})

	it('gives a socket the next part once the last is written', () => {
		const { socket, parts, release } = held()
		const sending = inParts(socket)
		let written = 0
		sending.send('a'.repeat(300 * 1024), () => {
			written += 1
		})
		sending.send('b', () => {
			written += 1
		})
		expect(parts).toEqual([{ size: 256 * 1024, fin: false }])
		expect(sending.unsent()).toBe(44 * 1024 + 1)
		release()
		expect(parts.at(-1)).toEqual({ size: 44 * 1024, fin: true })
		expect(written).toBe(0)
		release()
		expect(parts.at(-1)).toEqual({ size: 1, fin: true })
		expect(written).toBe(1)
		release()
		expect(written).toBe(2)
		expect(sending.unsent()).toBe(0)
	})

	it('ends all that waits once a socket cannot send', () => {
		const { socket, parts, release } = held()
		const sending = inParts(socket)
		let written = 0
		const count = () => {
			written += 1
		}
		sending.send('a'.repeat(300 * 1024), count)
		sending.send('b', count)
		release(new Error('closed'))
		expect(written).toBe(2)
		expect(sending.unsent()).toBe(0)
		expect(parts).toHaveLength(1)
		// A socket may still be sent to: it fails the same way.
		sending.send('c', count)
		release(new Error('closed'))
		expect(written).toBe(3)
	})
})
