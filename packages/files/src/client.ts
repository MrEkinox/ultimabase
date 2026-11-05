// A browser client for `POST /files` (D-250): a file or a list of files
// sent for a file field, their ids, and the server's refusal as a
// `FileError`. It imports nothing of the server.

/** What the server tells of a refusal, such as `{ issues }`. */
export type FileErrorDetails = { readonly [key: string]: unknown }

/** An upload the server refused, or that reached no server. */
export class FileError extends Error {
	readonly code: string
	declare readonly details?: FileErrorDetails

	constructor(code: string, message: string, details?: FileErrorDetails) {
		super(message)
		this.name = 'FileError'
		this.code = code
		if (details !== undefined) this.details = details
	}
}

/** Headers, as `fetch` takes them. */
export type UploadHeaders = ConstructorParameters<typeof Headers>[0]

/** Where uploads go, and the headers each one sends. */
export interface UploaderOptions {
	/** The server's address: `/files` is read from it. */
	readonly url: string
	/** The headers of each upload, or a function read at each upload. */
	readonly headers?:
		UploadHeaders | (() => UploadHeaders | Promise<UploadHeaders>) | undefined
}

/** What an upload is for. */
export interface UploadOptions {
	/** The file field: `Profile.avatar`. */
	readonly for: string
	readonly signal?: AbortSignal | undefined
}

/** Sends files for a file field; resolves to their ids. */
export interface Uploader {
	upload(file: File, options: UploadOptions): Promise<string>
	upload(files: Iterable<File>, options: UploadOptions): Promise<string[]>
}

const isRecord = (value: unknown): value is { [key: string]: unknown } =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** The server's `{ code, message, details }`, as a `FileError`. */
function errorOf(body: unknown): FileError {
	const { code, message, details } = isRecord(body) ? body : {}
	if (typeof code !== 'string' || typeof message !== 'string') {
		return new FileError('INTERNAL', 'The upload failed.')
	}
	return new FileError(code, message, isRecord(details) ? details : undefined)
}

/** An uploader to `options.url`. */
export function uploader(options: UploaderOptions): Uploader {
	const address = options.url.replace(/\/+$/, '')

	async function one(file: File, field: string, signal: AbortSignal) {
		const { headers } = options
		const query = new URLSearchParams({ for: field, name: file.name })
		let response: Response
		try {
			response = await fetch(`${address}/files?${query.toString()}`, {
				method: 'POST',
				headers: new Headers(
					typeof headers === 'function' ? await headers() : headers,
				),
				body: file,
				signal,
			})
		} catch {
			if (signal.aborted) throw signal.reason
			throw new FileError('NETWORK', 'The upload did not reach the server.')
		}
		const body: unknown = await response.json().catch(() => undefined)
		const id = isRecord(body) ? body['id'] : undefined
		if (response.ok && typeof id === 'string') return id
		throw errorOf(body)
	}

	function upload(file: File, options: UploadOptions): Promise<string>
	function upload(
		files: Iterable<File>,
		options: UploadOptions,
	): Promise<string[]>
	async function upload(
		files: File | Iterable<File>,
		{ for: field, signal }: UploadOptions,
	): Promise<string | string[]> {
		const controller = new AbortController()
		const abort = () => {
			controller.abort(signal?.reason)
		}
		signal?.addEventListener('abort', abort, { once: true })
		if (signal?.aborted === true) abort()
		try {
			if (files instanceof File) {
				return await one(files, field, controller.signal)
			}
			// The first failure aborts the others (D-250 point 3).
			return await Promise.all(
				Array.from(files, async (file) =>
					one(file, field, controller.signal).catch((error: unknown) => {
						controller.abort(error)
						throw error
					}),
				),
			)
		} finally {
			signal?.removeEventListener('abort', abort)
		}
	}

	return { upload }
}
