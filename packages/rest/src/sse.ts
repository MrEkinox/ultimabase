// A Server-Sent Events body (D-154): each event written whole, gzipped and
// flushed after each one when the client accepts gzip, and a comment every
// 12 s so neither a proxy nor the client takes the stream for dead.
import type { Transform } from 'node:stream'
import { PassThrough, Readable } from 'node:stream'
import { constants, createGzip } from 'node:zlib'

/** A client's buffer past which its changes are dropped. */
const maxBuffer = 1024 * 1024
/** Between two comments on a quiet stream. */
const keepAlive = 12_000

/** An open stream of events, and the response that sends it. */
export type Events = {
	readonly response: Response
	/** Writes one event; `id` is the revision it carries. */
	readonly send: (event: string, data: unknown, id?: number) => void
	/** Whether the client's buffer holds more than it may. */
	readonly full: () => boolean
	/** Runs `then` once the client took what it was sent. */
	readonly drained: (then: () => void) => void
	/** Ends the stream. */
	readonly end: () => void
}

/** Whether `header` (an `Accept-Encoding`) takes gzip. */
export function acceptsGzip(header: string | null): boolean {
	for (const part of (header ?? '').split(',')) {
		const [name = '', ...params] = part.split(';').map((each) => each.trim())
		if (name.toLowerCase() !== 'gzip') continue
		const q = params.find((param) => param.startsWith('q='))
		return q === undefined || Number(q.slice(2)) > 0
	}
	return false
}

/** A stream of events to `request`'s client; `closed` runs once it ends. */
export function eventsTo(request: Request, closed: () => void): Events {
	const gzip = acceptsGzip(request.headers.get('accept-encoding'))
	const zipped = gzip ? createGzip() : undefined
	const stream: Transform = zipped ?? new PassThrough()
	const write = (text: string) => {
		if (stream.writableEnded || stream.destroyed) return
		stream.write(text)
		zipped?.flush(constants.Z_SYNC_FLUSH)
	}
	const beating = setInterval(() => write(':\n\n'), keepAlive)
	beating.unref()
	stream.once('close', () => {
		clearInterval(beating)
		closed()
	})
	const end = () => {
		clearInterval(beating)
		stream.end()
	}
	request.signal.addEventListener('abort', () => stream.destroy())
	const headers: Record<string, string> = {
		'content-type': 'text/event-stream; charset=utf-8',
		'cache-control': 'no-store',
		// nginx buffers a response unless told not to.
		'x-accel-buffering': 'no',
		...(gzip ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}),
	}
	const body = Readable.toWeb(stream)
	return {
		response: new Response(body, { headers }),
		send: (event, data, id) => {
			const line = id === undefined ? '' : `id: ${id}\n`
			write(`${line}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
		},
		full: () => stream.writableLength + stream.readableLength > maxBuffer,
		drained: (then) => {
			if (stream.writableNeedDrain) stream.once('drain', then)
			else then()
		},
		end,
	}
}
