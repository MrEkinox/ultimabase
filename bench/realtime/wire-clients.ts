// The clients of `wire.ts`, on a thread of their own so that they do not slow
// the server: one socket each, speaking `graphql-transport-ws` by hand. They
// count messages without parsing them: a browser parses on its own machine, one
// thread parsing for all would only measure itself.
import { parentPort } from 'node:worker_threads'
import { WebSocket } from 'ws'

export type Command =
	| {
			readonly kind: 'open'
			readonly url: string
			readonly from: number
			readonly count: number
			readonly query: string
			readonly variables: Readonly<Record<string, unknown>>
			readonly deflate: boolean
	  }
	| { readonly kind: 'expect'; readonly count: number }
	| { readonly kind: 'close' }

export type Reply =
	| { readonly kind: 'opened'; readonly at: number; readonly bytes: number }
	| { readonly kind: 'ready' }
	| { readonly kind: 'reached'; readonly at: number; readonly bytes: number }
	| { readonly kind: 'closed' }
	| { readonly kind: 'failed'; readonly message: string }

const now = () => performance.timeOrigin + performance.now()
const port = parentPort
if (port === null) throw new Error('This file runs as a worker.')
const reply = (message: Reply) => {
	port.postMessage(message)
}

let sockets: WebSocket[] = []
let counted = 0
let expected = Number.POSITIVE_INFINITY

function opened(command: Extract<Command, { kind: 'open' }>): void {
	let first = 0
	let firstBytes = 0
	sockets = Array.from({ length: command.count }, (_, index) => {
		const socket = new WebSocket(command.url, 'graphql-transport-ws', {
			perMessageDeflate: command.deflate,
			maxPayload: 0,
		})
		let started = false
		socket.on('open', () => {
			socket.send(
				JSON.stringify({
					type: 'connection_init',
					payload: { authorization: `u${command.from + index}` },
				}),
			)
		})
		socket.on('error', (error) => {
			reply({ kind: 'failed', message: error.message })
		})
		socket.on('message', (data: Buffer) => {
			const head = data.subarray(0, 40).toString()
			if (head.includes('"connection_ack"')) {
				socket.send(
					JSON.stringify({
						id: '1',
						type: 'subscribe',
						payload: { query: command.query, variables: command.variables },
					}),
				)
			} else if (head.includes('"next"')) {
				if (!started) {
					started = true
					first += 1
					firstBytes = data.length
					if (first === command.count) {
						reply({ kind: 'opened', at: now(), bytes: firstBytes })
					}
					return
				}
				counted += 1
				if (counted === expected) {
					reply({ kind: 'reached', at: now(), bytes: data.length })
				}
			} else if (head.includes('"error"')) {
				reply({ kind: 'failed', message: data.toString().slice(0, 500) })
			}
		})
		return socket
	})
}

port.on('message', (command: Command) => {
	if (command.kind === 'open') opened(command)
	else if (command.kind === 'expect') {
		counted = 0
		expected = command.count
		reply({ kind: 'ready' })
	} else {
		for (const socket of sockets) socket.terminate()
		sockets = []
		reply({ kind: 'closed' })
	}
})
