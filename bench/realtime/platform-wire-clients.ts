// The clients of `platform-wire.ts`, on threads of their own so that they do
// not slow the server: one socket a user, speaking `graphql-transport-ws` by
// hand. They read only the messages whose delay counts.
import { request } from 'node:http'
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
	| {
			/** `clients` arrive at random within `over` ms, each retrying when lost. */
			readonly kind: 'storm'
			readonly url: string
			readonly field: string
			readonly clients: readonly Client[]
			readonly over: number
	  }
	| {
			/** A new visitor's request every `every` ms, on a connection of its own. */
			readonly kind: 'probe'
			readonly url: string
			readonly authorization: string
			readonly body: string
			readonly every: number
	  }
	| { readonly kind: 'probed' }
	| { readonly kind: 'begin' }
	| { readonly kind: 'end' }
	| { readonly kind: 'close' }

export type Reply =
	| { readonly kind: 'opened' }
	| {
			readonly kind: 'stormed'
			/** For each client, the ms until its first state and until all of them. */
			readonly first: readonly number[]
			readonly all: readonly number[]
			/** Why attempts were lost, and how many times. */
			readonly lost: Readonly<Record<string, number>>
	  }
	| {
			readonly kind: 'probes'
			readonly delays: readonly number[]
			readonly failed: number
	  }
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

type Opening = {
	/** Its first subscription answered. */
	readonly first: () => void
	/** All its subscriptions answered. */
	readonly ready: () => void
	/** Lost before that, once. */
	readonly lost: (why: string) => void
}

function connecting(url: string, client: Client, on: Opening): void {
	const socket = new WebSocket(url, 'graphql-transport-ws', {
		perMessageDeflate: true,
		maxPayload: 0,
		// A browser waits for its connection; Node's race gives up after 250 ms.
		family: 4,
	})
	sockets.push(socket)
	const waiting = new Set(client.subscriptions.map(({ id }) => id))
	let gone = false
	const lost = (why: string) => {
		if (gone || waiting.size === 0) return
		gone = true
		on.lost(why)
	}
	socket.on('open', () => {
		socket.send(
			JSON.stringify({
				type: 'connection_init',
				payload: { authorization: client.authorization },
			}),
		)
	})
	socket.on('error', (error) => {
		lost('code' in error ? String(error.code) : error.message)
	})
	socket.on('close', (code) => {
		lost(`closed ${code}`)
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
				if (waiting.size === client.subscriptions.length - 1) on.first()
				if (waiting.size === 0) on.ready()
			} else if (counting && id === 't') timed(data)
		} else if (head.includes('"error"')) {
			reply({ kind: 'failed', message: data.toString().slice(0, 500) })
		}
	})
}

function opened(command: Extract<Command, { kind: 'open' }>): void {
	;({ field } = command)
	let next = 0
	let ready = 0
	const start = () => {
		const client = command.clients[next]
		if (client === undefined) return
		next += 1
		connecting(command.url, client, {
			first: () => undefined,
			ready: () => {
				ready += 1
				if (ready === command.clients.length) reply({ kind: 'opened' })
				else start()
			},
			lost: (message) => {
				reply({ kind: 'failed', message })
			},
		})
	}
	for (let index = 0; index < opening; index += 1) start()
}

function stormed(command: Extract<Command, { kind: 'storm' }>): void {
	;({ field } = command)
	const first: number[] = []
	const all: number[] = []
	const lost: Record<string, number> = {}
	if (command.clients.length === 0) {
		reply({ kind: 'stormed', first, all, lost })
	}
	for (const client of command.clients) {
		const arrival = Math.random() * command.over
		const arrived = Date.now() + arrival
		let answered = false
		const attempt = () => {
			connecting(command.url, client, {
				first: () => {
					if (answered) return
					answered = true
					first.push(Date.now() - arrived)
				},
				ready: () => {
					all.push(Date.now() - arrived)
					if (all.length === command.clients.length) {
						reply({ kind: 'stormed', first, all, lost })
					}
				},
				lost: (why) => {
					lost[why] = (lost[why] ?? 0) + 1
					// What `graphql-ws` waits by default before its first retry.
					setTimeout(attempt, 1000 + 300 + Math.random() * 2700)
				},
			})
		}
		setTimeout(attempt, arrival)
	}
}

let probing: ReturnType<typeof setInterval> | undefined
const probes = { delays: [] as number[], failed: 0, running: 0 }

function probed(command: Extract<Command, { kind: 'probe' }>): void {
	const url = new URL(command.url)
	probing = setInterval(() => {
		const due = Date.now()
		probes.running += 1
		const settle = (ok: boolean) => {
			probes.running -= 1
			if (ok) probes.delays.push(Date.now() - due)
			else probes.failed += 1
		}
		const sent = request(
			url,
			{
				method: 'POST',
				agent: false,
				family: 4,
				timeout: 120_000,
				headers: {
					authorization: command.authorization,
					'content-type': 'application/json',
				},
			},
			(response) => {
				const chunks: Buffer[] = []
				response.on('data', (chunk: Buffer) => chunks.push(chunk))
				response.on('end', () => {
					const text = Buffer.concat(chunks).toString()
					const fine = response.statusCode === 200 && !text.includes('"errors"')
					if (!fine) {
						reply({ kind: 'failed', message: text.slice(0, 500) })
					}
					settle(fine)
				})
			},
		)
		sent.on('error', () => {
			settle(false)
		})
		sent.on('timeout', () => {
			sent.destroy()
		})
		sent.end(command.body)
	}, command.every)
}

setInterval(() => {
	if (!counting || delays.length === reported) return
	reported = delays.length
	reply({ kind: 'count', count: reported })
}, 20).unref()

port.on('message', (command: Command) => {
	if (command.kind === 'open') opened(command)
	else if (command.kind === 'storm') stormed(command)
	else if (command.kind === 'probe') probed(command)
	else if (command.kind === 'probed') {
		clearInterval(probing)
		const answer = () => {
			if (probes.running > 0) {
				setTimeout(answer, 50)
				return
			}
			reply({ kind: 'probes', delays: probes.delays, failed: probes.failed })
		}
		answer()
	} else if (command.kind === 'begin') {
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
