// `ultimabase dev` run by a program (D-356): its first start reports its
// exit code, and a failure ends the watcher instead of waiting for a change.
import { connect, createServer } from 'node:net'
import type { Io } from './cli-main.ts'

/** The variable that gives the application the port `dev` listens on. */
const variable = 'ULTIMABASE_DEV_REPORT'

/**
 * Runs Node with `args`, the watcher, and stops it when the first start
 * reports a code other than 0, which it then returns.
 */
export async function unattended(
	args: readonly string[],
	node: Io['node'],
): Promise<number> {
	const watcher = new AbortController()
	let failed: number | undefined
	const server = createServer((socket) => {
		server.close()
		let text = ''
		socket.setEncoding('utf8')
		socket.on('data', (chunk: string) => {
			text += chunk
		})
		socket.on('end', () => {
			if (!/^[1-9]\d{0,2}$/.test(text)) return
			failed = Number(text)
			watcher.abort()
		})
	})
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
	const port: unknown = Reflect.get(Object(server.address()), 'port')
	const code = await node(args, {
		env: { [variable]: String(port) },
		signal: watcher.signal,
	})
	server.close()
	return failed ?? code
}

/** Sends the start's `code` to the `dev` that waits for it, if any. */
export async function reportStart(code: number): Promise<void> {
	const port = process.env[variable]
	if (port === undefined) return
	await new Promise<void>((done) => {
		const socket = connect(Number(port), '127.0.0.1', () => {
			socket.end(String(code))
		})
		socket.on('error', () => done())
		socket.on('close', () => done())
	})
}
