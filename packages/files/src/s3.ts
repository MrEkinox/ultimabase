// `s3()` (D-152): any S3-compatible storage (AWS, DigitalOcean Spaces,
// MinIO, SeaweedFS), path-style, each request presigned with SigV4.
import type { Signer } from './sigv4.ts'
import { presign } from './sigv4.ts'
import type { FileStorage } from './storage.ts'
import { isPublic } from './storage.ts'

/** What `s3()` takes; the first five are required, read when the application starts. */
export interface S3Options {
	readonly bucket: string | undefined
	readonly region: string | undefined
	/** `https://fra1.digitaloceanspaces.com`. */
	readonly endpoint: string | undefined
	readonly accessKeyId: string | undefined
	readonly secretAccessKey: string | undefined
	/** Sends `x-amz-acl: public-read` with a public file, which Spaces needs. */
	readonly publicAcl?: boolean
	/** The base of a public file's URL, a CDN; the storage's own otherwise. */
	readonly publicUrl?: string
}

const required = [
	'bucket',
	'region',
	'endpoint',
	'accessKeyId',
	'secretAccessKey',
] as const

type Config = Signer & { readonly bucket: string; readonly base: string }

const trimmed = (url: string): string => url.replace(/\/+$/, '')

/** The options checked: a missing one stops startup, naming it. */
function configOf(options: S3Options): Config {
	const missing = required.filter((key) => !options[key])
	if (missing.length > 0) {
		throw new Error(`s3() needs ${missing.join(', ')}: undefined or empty.`)
	}
	const { bucket = '', region = '', endpoint = '' } = options
	const { accessKeyId = '', secretAccessKey = '' } = options
	const base = `${trimmed(endpoint)}/${encodeURIComponent(bucket)}`
	return { bucket, region, accessKeyId, secretAccessKey, base }
}

/** Sent unchanged when the storage answers otherwise. */
async function answered(
	response: Response,
	what: string,
	expected: readonly number[] = [200],
): Promise<Response> {
	if (expected.includes(response.status)) return response
	const text = await response.text()
	throw new Error(`s3: ${what} failed with ${response.status}: ${text}`)
}

const entities: { readonly [entity: string]: string } = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
}
const decoded = (text: string): string =>
	text.replaceAll(
		/&(amp|lt|gt|quot|apos);/g,
		(entity, name: string) => entities[name] ?? entity,
	)

/** The keys of one `ListObjectsV2` page, and the token of the next. */
function pageOf(xml: string): {
	readonly keys: readonly string[]
	readonly next: string | undefined
} {
	const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(([, key = '']) =>
		decoded(key),
	)
	const truncated = xml.includes('<IsTruncated>true</IsTruncated>')
	const token = /<NextContinuationToken>([^<]*)</.exec(xml)?.[1]
	return { keys, next: truncated && token ? decoded(token) : undefined }
}

/** An S3-compatible storage; its options are checked when the application starts. */
export function s3(options: S3Options): FileStorage {
	let config: Config | undefined
	const configured = (): Config => (config ??= configOf(options))
	const objectUrl = (key: string) => new URL(`${configured().base}/${key}`)
	const signed = (
		method: string,
		url: URL,
		expires: number,
		headers: { readonly [name: string]: string } = {},
	) => presign(configured(), { method, url, expires, headers })
	return {
		start: () => {
			configured()
		},
		put: async (key, body, { type, size, attachment }) => {
			const headers: Record<string, string> = { 'content-type': type }
			if (attachment) headers['content-disposition'] = 'attachment'
			if (isPublic(key) && options.publicAcl === true) {
				headers['x-amz-acl'] = 'public-read'
			}
			const url = signed('PUT', objectUrl(key), 900, headers)
			const response = await fetch(url, {
				method: 'PUT',
				headers: { ...headers, 'content-length': String(size) },
				body,
				duplex: 'half',
			})
			await answered(response, `PUT ${key}`)
		},
		delete: async (key) => {
			const url = signed('DELETE', objectUrl(key), 900)
			const response = await fetch(url, { method: 'DELETE' })
			await answered(response, `DELETE ${key}`, [200, 204, 404])
		},
		keys: async () => {
			const keys: string[] = []
			let next: string | undefined
			do {
				const list = new URL(configured().base)
				list.searchParams.set('list-type', '2')
				if (next !== undefined)
					list.searchParams.set('continuation-token', next)
				const response = await fetch(signed('GET', list, 900))
				const page = pageOf(await (await answered(response, 'list')).text())
				keys.push(...page.keys)
				next = page.next
			} while (next !== undefined)
			return keys
		},
		url: (key) => {
			if (!isPublic(key)) return signed('GET', objectUrl(key), 3600)
			const { publicUrl } = options
			return publicUrl === undefined
				? objectUrl(key).href
				: `${trimmed(publicUrl)}/${key}`
		},
	}
}
