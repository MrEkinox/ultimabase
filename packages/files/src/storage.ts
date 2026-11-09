// What `filesPlugin` stores files in (D-152, D-202): an S3-compatible
// storage, a disk, or memory for tests. A key starts with `public/` or
// `private/`, which says how the object is served.

/** A file's bytes: streamed from a request, or held in memory. */
export type FileBody = ReadableStream<Uint8Array> | Uint8Array

/** How an object is stored and served. */
export interface PutOptions {
	readonly type: string
	/** The body's length in bytes, which the storage checks. */
	readonly size: number
	/** Served as a download, so a browser never runs it: all but media (D-351). */
	readonly attachment: boolean
}

/** The running HTTP server, which a storage that serves its files reads. */
export interface Server {
	/** Its address, as `http://localhost:3000`. */
	readonly url: string
}

/** A storage adapter: `s3()`, `diskFiles()` or `memoryFiles()`. */
export interface FileStorage {
	/** Checks its options when the application starts. */
	start(server: Server): void
	put(key: string, body: FileBody, options: PutOptions): Promise<void>
	/** Deletes an object; a missing one is not an error. */
	delete(key: string): Promise<void>
	/** Every key it stores. */
	keys(): Promise<readonly string[]>
	/** A public object's stable URL, a private one's presigned, the same for 15 minutes (D-200). */
	url(key: string): string
	/**
	 * The answer of `GET /files/<key>`, for a storage the application serves
	 * (D-202); `url` then gives that route's URL.
	 */
	serve?(key: string, url: URL): Promise<Response>
}

/** A private file's URL stays the same this long, in milliseconds (D-200). */
export const urlWindow: number = 15 * 60 * 1000

/** The start of the window `now` is in, in milliseconds. */
export const windowOf = (now: number): number =>
	Math.floor(now / urlWindow) * urlWindow

/** A file's key: `public/<uuid>` or `private/<uuid>`. */
export const keyPattern: RegExp = /^(public|private)\/[0-9a-f-]{36}$/u

/** Whether a key is served to everyone. */
export const isPublic = (key: string): boolean => key.startsWith('public/')

/**
 * Each promise ended, then the first failure thrown: a put still running
 * would store an object after its cleanup.
 */
export async function settled<T>(
	promises: readonly Promise<T>[],
): Promise<T[]> {
	const results = await Promise.allSettled(promises)
	const failed = results.find((result) => result.status === 'rejected')
	if (failed !== undefined) throw failed.reason
	return results.flatMap((result) =>
		result.status === 'fulfilled' ? [result.value] : [],
	)
}

/**
 * `task` run on each item, `width` at a time, and each outcome in the items'
 * order: a sweep of thousands of files opens at most `width` requests.
 */
export async function pooled<T, R>(
	items: readonly T[],
	width: number,
	task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = []
	const entries = items.entries()
	const worker = async (): Promise<void> => {
		for (const [at, item] of entries) {
			;[results[at]] = await Promise.allSettled([task(item)])
		}
	}
	// A worker with no item left ends at once.
	await Promise.all(Array.from({ length: width }, worker))
	return results
}
