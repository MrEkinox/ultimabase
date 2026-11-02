// `memoryFiles()` (D-152, D-202): a storage in memory, which tests use, so
// that no test writes to a real storage; the application serves its files.
import { serving } from './served.ts'
import type { FileBody, FileStorage } from './storage.ts'

/** An object `memoryFiles()` holds. */
export interface MemoryObject {
	readonly body: Uint8Array
	readonly type: string
	readonly attachment: boolean
}

/** A storage in memory, its objects readable by tests. */
export interface MemoryFiles extends FileStorage {
	readonly objects: ReadonlyMap<string, MemoryObject>
}

/** The bytes of a body, read to its end. */
export async function bytesOf(body: FileBody): Promise<Uint8Array> {
	if (body instanceof Uint8Array) return body
	return new Uint8Array(await new Response(body).arrayBuffer())
}

/** What `memoryFiles` takes. */
export interface MemoryOptions {
	/** The origin its URLs start with: the HTTP server's address by default. */
	readonly servedAt?: string | undefined
}

/** A storage in memory, its files served at `GET /files/<key>`. */
export function memoryFiles(options: MemoryOptions = {}): MemoryFiles {
	const objects = new Map<string, MemoryObject>()
	const served = serving('memoryFiles', options)
	return {
		objects,
		start: served.start,
		put: async (key, body, { type, size, attachment }) => {
			const bytes = await bytesOf(body)
			if (bytes.length !== size) {
				throw new Error(
					`memoryFiles: ${key} has ${bytes.length} bytes, not ${size}.`,
				)
			}
			objects.set(key, { body: bytes, type, attachment })
		},
		delete: async (key) => {
			objects.delete(key)
		},
		keys: async () => [...objects.keys()],
		url: served.url,
		serve: (key, url) =>
			served.serve(key, url, async () => {
				const object = objects.get(key)
				return object && { ...object, size: object.body.length }
			}),
	}
}
