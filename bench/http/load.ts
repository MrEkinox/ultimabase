// The clients of the HTTP benchmark, a process of their own so that their work
// is not counted as the server's. Each sends its next request once its last
// answered, on a connection it keeps, and the parent reads what they measured.
import { Agent, request } from 'node:http'

/** One request a case sends, in turn with the others. */
export type Sent = {
	readonly method: string
	readonly path: string
	readonly headers: Readonly<Record<string, string>>
	readonly body?: string
}

export type Asked = {
	readonly port: number
	readonly sent: readonly Sent[]
	readonly concurrency: number
	readonly warm: number
	readonly seconds: number
}

export type Measured = {
	readonly count: number
	readonly failed: number
	readonly firstFailure: string
	/** Each timed request's time, in ms. */
	readonly times: readonly number[]
}

const isAsked = (value: unknown): value is Asked =>
	typeof value === 'object' && value !== null && 'sent' in value

export const isMeasured = (value: unknown): value is Measured =>
	typeof value === 'object' && value !== null && 'times' in value

async function send(
	agent: Agent,
	port: number,
	sent: Sent,
): Promise<{ status: number; body: string }> {
	return new Promise((done, fail) => {
		const outgoing = request(
			{
				agent,
				port,
				host: '127.0.0.1',
				method: sent.method,
				path: sent.path,
				headers: sent.headers,
			},
			(response) => {
				const parts: Buffer[] = []
				response.on('data', (part: Buffer) => parts.push(part))
				response.on('end', () => {
					done({
						status: response.statusCode ?? 0,
						body: Buffer.concat(parts).toString(),
					})
				})
				response.on('error', fail)
			},
		)
		outgoing.on('error', fail)
		outgoing.end(sent.body)
	})
}

async function run(asked: Asked): Promise<Measured> {
	const agent = new Agent({ keepAlive: true, maxSockets: asked.concurrency })
	const times: number[] = []
	let failed = 0
	let firstFailure = ''
	let turn = 0
	const begin = performance.now()
	const timedFrom = begin + asked.warm * 1000
	const end = timedFrom + asked.seconds * 1000
	const client = async (): Promise<void> => {
		while (performance.now() < end) {
			const sent = asked.sent[turn % asked.sent.length]
			turn += 1
			if (sent === undefined) throw new Error('A case sends nothing.')
			const start = performance.now()
			try {
				const { status, body } = await send(agent, asked.port, sent)
				const graphqlFailed = body.startsWith('{"errors"')
				if (status >= 400 || graphqlFailed) {
					failed += 1
					firstFailure ||= `${String(status)} ${body.slice(0, 300)}`
				}
			} catch (error) {
				failed += 1
				firstFailure ||= String(error)
			}
			if (start >= timedFrom) times.push(performance.now() - start)
		}
	}
	await Promise.all(Array.from({ length: asked.concurrency }, client))
	agent.destroy()
	return { count: times.length, failed, firstFailure, times }
}

async function answer(asked: unknown): Promise<void> {
	if (!isAsked(asked)) throw new TypeError('Not what a client is asked.')
	const measured = await run(asked)
	process.send?.(measured, () => process.exit(0))
}

// This file's types are the benchmark's too, which imports it.
if (process.send !== undefined) {
	process.on('message', (asked: unknown) => {
		void answer(asked)
	})
}
