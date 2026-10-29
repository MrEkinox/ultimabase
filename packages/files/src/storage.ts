// What `filesPlugin` stores files in (D-152): an S3-compatible storage, or
// memory for tests. A key starts with `public/` or `private/`, which says
// how the object is served.

/** A file's bytes: streamed from a request, or held in memory. */
export type FileBody = ReadableStream<Uint8Array> | Uint8Array

/** How an object is stored and served. */
export interface PutOptions {
	readonly type: string
	/** The body's length in bytes, which the storage checks. */
	readonly size: number
	/** Served as a download, so a browser never runs it: SVG, undetected types. */
	readonly attachment: boolean
}

/** A storage adapter: `s3()` or `memoryFiles()`. */
export interface FileStorage {
	/** Checks its options when the application starts. */
	start(): void
	put(key: string, body: FileBody, options: PutOptions): Promise<void>
	/** Deletes an object; a missing one is not an error. */
	delete(key: string): Promise<void>
	/** Every key it stores. */
	keys(): Promise<readonly string[]>
	/** A public object's stable URL, a private one's presigned for one hour. */
	url(key: string): string
}

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
