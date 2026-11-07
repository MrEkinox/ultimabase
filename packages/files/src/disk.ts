// `diskFiles({ dir, secret })` (D-202): a storage in a directory, which the
// application serves; for one server whose directory is a persistent volume.
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs'
import {
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { serving } from './served.ts'
import type { FileStorage } from './storage.ts'
import { keyPattern } from './storage.ts'

/** What `diskFiles` takes; each option takes `undefined`, which start refuses. */
export interface DiskOptions {
	/** The directory it stores in, made when missing. */
	readonly dir: string | undefined
	/** Signs the private files' URLs: 32 characters at least, the same on every start. */
	readonly secret: string | undefined
	/** The origin its URLs start with: the HTTP server's address by default. */
	readonly servedAt?: string | undefined
}

function checked(key: string): string {
	if (!keyPattern.test(key))
		throw new Error(`diskFiles: ${key} is not a file key.`)
	return key
}

const isMeta = (
	value: unknown,
): value is { type: string; attachment: boolean } =>
	typeof value === 'object' &&
	value !== null &&
	typeof Reflect.get(value, 'type') === 'string' &&
	typeof Reflect.get(value, 'attachment') === 'boolean'

/** A storage in `dir`, its files served at `GET /files/<key>`. */
export function diskFiles(options: DiskOptions): FileStorage {
	const { secret } = options
	const dir = options.dir ?? ''
	const served = serving('diskFiles', options)
	const pathOf = (key: string) => join(dir, checked(key))
	return {
		start: (server) => {
			if (dir === '')
				throw new Error('diskFiles() needs dir: undefined or empty.')
			if (secret === undefined || secret.length < 32) {
				throw new Error('diskFiles() needs a secret of 32 characters at least.')
			}
			for (const prefix of ['public', 'private']) {
				mkdirSync(join(dir, prefix), { recursive: true })
			}
			served.start(server)
		},
		put: async (key, body, { type, size, attachment }) => {
			const path = pathOf(key)
			const temporary = `${path}.${randomUUID()}.tmp`
			let total = 0
			// Counted as it is written: a streamed body stops past its size.
			async function* counted(chunks: AsyncIterable<Uint8Array>) {
				for await (const chunk of chunks) {
					total += chunk.length
					if (total > size)
						throw new Error(`diskFiles: ${key} has over ${size} bytes.`)
					yield chunk
				}
			}
			try {
				// 16 chunks, about 1 MiB, read ahead and written at once (D-303).
				const chunks = body instanceof Uint8Array ? [body] : body
				const source = Readable.from(chunks, { highWaterMark: 16 })
				const sink = createWriteStream(temporary, { highWaterMark: 1 << 20 })
				await pipeline(source, counted, sink)
				if (total !== size) {
					throw new Error(`diskFiles: ${key} has ${total} bytes, not ${size}.`)
				}
				await writeFile(
					`${temporary}.json`,
					JSON.stringify({ type, attachment }),
				)
				// The type first: a body without it is never served.
				await rename(`${temporary}.json`, `${path}.json`)
				await rename(temporary, path)
			} finally {
				await rm(temporary, { force: true })
				await rm(`${temporary}.json`, { force: true })
			}
		},
		delete: async (key) => {
			const path = pathOf(key)
			await rm(path, { force: true })
			await rm(`${path}.json`, { force: true })
		},
		keys: async () => {
			const listed = await Promise.all(
				['public', 'private'].map(async (prefix) => {
					const names = await readdir(join(dir, prefix))
					return names.map((name) => `${prefix}/${name}`)
				}),
			)
			return listed.flat().filter((key) => keyPattern.test(key))
		},
		url: (key) => served.url(checked(key)),
		serve: (key, url) =>
			served.serve(key, url, async () => {
				const path = pathOf(key)
				try {
					const [meta, { size }] = await Promise.all([
						readFile(`${path}.json`, 'utf8'),
						stat(path),
					])
					const parsed: unknown = JSON.parse(meta)
					if (!isMeta(parsed))
						throw new Error(`diskFiles: ${key}.json is not a file's type.`)
					const body = Readable.toWeb(createReadStream(path))
					return { ...parsed, size, body }
				} catch (error) {
					if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT')
						return undefined
					throw error
				}
			}),
	}
}
