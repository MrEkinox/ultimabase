// The clients of `platform-wire.ts`, on threads of their own so that they do
// not slow the server: one socket a user, speaking `graphql-transport-ws` by
// hand. They read only the messages whose delay counts.
import { parentPort } from 'node:worker_threads'
import { WebSocket } from 'ws'

/** One user's socket, and what it follows. The one named `t` is timed. */
export type Client = {
	readonly authorization: string
	readonly subscriptions: readonly {
		readonly id: string
		readonly query: string
		readonly variables: Readonly<Record<string, unknown>>
	}[]
}

export type Command =
	| {
			readonly kind: 'open'
			readonly url: string
			readonly clients: readonly Client[]
			/** The field of a timed row that holds when its write was due. */
			readonly field: string
	  }
	| { readonly kind: 'begin' }
	| { readonly kind: 'end' }
	| { readonly kind: 'close' }

export type Reply =
	| { readonly kind: 'opened' }
	| { readonly kind: 'began' }
	| { readonly kind: 'count'; readonly count: number }
	| { readonly kind: 'ended'; readonly delays: readonly number[] }
	| { readonly kind: 'closed' }
	| { readonly kind: 'failed'; readonly message: string }

const port = parentPort
if (port === null) throw new Error('This file runs as a worker.')
const reply = (message: Reply) => {
	port.postMessage(message)
}

/** How many sockets connect at the same time. */
const opening = 32
const sockets: WebSocket[] = []
let field = ''
let counting = false
let delays: number[] = []
let reported = 0

const dueOf = (value: unknown): number =>
	typeof value === 'string'
		? /^\d+$/u.test(value)
			? Number(value)
			: Date.parse(value)
		: Number.NaN

const nested = (value: unknown, ...path: readonly string[]): unknown => {
	let at = value
	for (const key of path) at = Reflect.get(Object(at), key)
	return at
}

function timed(data: Buffer): void {
	const now = Date.now()
	const parsed: unknown = JSON.parse(data.toString())
	const changes = nested(parsed, 'payload', 'extensions', 'live', 'changes')
	if (!Array.isArray(changes)) return
	for (const change of changes) {
		const due = dueOf(nested(change, 'upsert', 'node', field))
		if (!Number.isNaN(due)) delays.push(now - due)
	}
}

function opened(command: Extract<Command, { kind: 'open' }>): void {
	;({ field } = command)
	let next = 0
	let ready = 0
	const start = () => {
		const client = command.clients[next]
		if (client === undefined) return
		next += 1
		const socket = new WebSocket(command.url, 'graphql-transport-ws', {
			perMessageDeflate: true,
			maxPayload: 0,
		})
		sockets.push(socket)
		const waiting = new Set(client.subscriptions.map(({ id }) => id))
		socket.on('open', () => {
			socket.send(
				JSON.stringify({
					type: 'connection_init',
					payload: { authorization: client.authorization },
				}),
			)
		})
		socket.on('error', (error) => {
			reply({ kind: 'failed', message: error.message })
		})
		socket.on('message', (data: Buffer) => {
			const head = data.subarray(0, 40).toString()
			if (head.includes('"connection_ack"')) {
				for (const { id, query, variables } of client.subscriptions) {
					socket.send(
						JSON.stringify({
							id,
							type: 'subscribe',
							payload: { query, variables },
						}),
					)
				}
			} else if (head.includes('"next"')) {
				const id = head.slice(7, head.indexOf('"', 7))
				if (waiting.delete(id)) {
					if (data.includes('"errors"')) {
						reply({ kind: 'failed', message: data.toString().slice(0, 500) })
					}
					if (waiting.size > 0) return
					ready += 1
					if (ready === command.clients.length) reply({ kind: 'opened' })
					else start()
				} else if (counting && id === 't') timed(data)
			} else if (head.includes('"error"')) {
				reply({ kind: 'failed', message: data.toString().slice(0, 500) })
			}
		})
	}
	for (let index = 0; index < opening; index += 1) start()
}

setInterval(() => {
	if (!counting || delays.length === reported) return
	reported = delays.length
	reply({ kind: 'count', count: reported })
}, 20).unref()

port.on('message', (command: Command) => {
	if (command.kind === 'open') opened(command)
	else if (command.kind === 'begin') {
		delays = []
		reported = 0
		counting = true
		reply({ kind: 'began' })
	} else if (command.kind === 'end') {
		counting = false
		reply({ kind: 'ended', delays })
	} else {
		for (const socket of sockets) socket.terminate()
		reply({ kind: 'closed' })
	}
})
