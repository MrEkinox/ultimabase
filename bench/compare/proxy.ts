// Counts the round trips every client pays the same way (D-100): a proxy
// between the clients and PostgreSQL counts each query a client sends, a
// `Query` message, or a `Sync` that closes an extended-protocol query.
import type { Socket } from 'node:net'
import { connect, createServer } from 'node:net'

/** The protocol version a startup message carries, after SSL or GSS requests. */
const startup = 196_608
const query = 0x51
const sync = 0x53

export type Proxy = {
	/** The PostgreSQL url `url` with the proxy in place of its server. */
	readonly url: string
	readonly count: () => number
	readonly close: () => Promise<void>
}

export async function proxy(url: string): Promise<Proxy> {
	const target = new URL(url)
	let queries = 0
	const sockets = new Set<Socket>()
	const listener = createServer((client) => {
		const server = connect(Number(target.port || 5432), target.hostname)
		for (const socket of [client, server]) {
			sockets.add(socket)
			socket.on('close', () => sockets.delete(socket))
			socket.on('error', () => {
				client.destroy()
				server.destroy()
			})
		}
		server.pipe(client)
		let started = false
		let pending = Buffer.alloc(0)
		client.on('data', (chunk: Buffer) => {
			server.write(chunk)
			pending = Buffer.concat([pending, chunk])
			for (;;) {
				if (!started) {
					if (pending.length < 8) break
					const length = pending.readInt32BE(0)
					if (pending.length < length) break
					started = pending.readInt32BE(4) === startup
					pending = pending.subarray(length)
					continue
				}
				if (pending.length < 5) break
				const length = 1 + pending.readInt32BE(1)
				if (pending.length < length) break
				const type = pending[0]
				if (type === query || type === sync) queries += 1
				pending = pending.subarray(length)
			}
		})
	})
	await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
	const address = listener.address()
	if (address === null || typeof address === 'string') {
		throw new Error('The proxy has no port.')
	}
	const proxied = new URL(url)
	proxied.hostname = '127.0.0.1'
	proxied.port = String(address.port)
	return {
		url: proxied.toString(),
		count: () => queries,
		close: async () => {
			for (const socket of sockets) socket.destroy()
			await new Promise((resolve) => listener.close(resolve))
		},
	}
}
