// `memoryFiles()` (D-152): a storage in memory, which tests use, so that no
// test writes to a real storage.
import type { FileBody, FileStorage } from './storage.ts'
import { isPublic } from './storage.ts'

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

/** A storage in memory: its URLs are `memory://files/<key>`, never served. */
export function memoryFiles(): MemoryFiles {
	const objects = new Map<string, MemoryObject>()
	return {
		objects,
		start: () => {},
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
		url: (key) =>
			`memory://files/${key}${isPublic(key) ? '' : '?expires=3600'}`,
	}
}
