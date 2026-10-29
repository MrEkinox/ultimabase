// AWS Signature Version 4, query presigning (D-152): on `node:crypto`, which
// is synchronous, so a read signs its URLs while it decodes. The payload is
// unsigned, as presigned URLs are.
import { createHash, createHmac } from 'node:crypto'

export interface Signer {
	readonly region: string
	readonly accessKeyId: string
	readonly secretAccessKey: string
}

export interface Presigned {
	readonly method: string
	readonly url: URL
	/** The headers the request sends and signs, `host` added. */
	readonly headers: { readonly [name: string]: string }
	/** In seconds. */
	readonly expires: number
}

/** RFC 3986, as SigV4 encodes: everything but `A-Za-z0-9-_.~`. */
const encoded = (value: string): string =>
	encodeURIComponent(value).replaceAll(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	)

const hmac = (key: string | Buffer, value: string): Buffer =>
	createHmac('sha256', key).update(value).digest()

/** `20130524T000000Z`. */
const stampOf = (now: Date): string =>
	now
		.toISOString()
		.replaceAll(/[-:]/g, '')
		.replace(/\.\d{3}/, '')

/** The URL that runs the request until it expires, signed now. */
export function presign(signer: Signer, request: Presigned): string {
	const { method, url, expires } = request
	const stamp = stampOf(new Date())
	const day = stamp.slice(0, 8)
	const scope = `${day}/${signer.region}/s3/aws4_request`
	const headers = new Map(
		Object.entries({ ...request.headers, host: url.host }).map(
			([name, value]) => [name.toLowerCase(), value.trim()],
		),
	)
	const names = [...headers.keys()].toSorted()
	const signed = names.join(';')
	const query = new URLSearchParams(url.search)
	query.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
	query.set('X-Amz-Credential', `${signer.accessKeyId}/${scope}`)
	query.set('X-Amz-Date', stamp)
	query.set('X-Amz-Expires', String(expires))
	query.set('X-Amz-SignedHeaders', signed)
	const canonicalQuery = [...query]
		.map(([key, value]) => [encoded(key), encoded(value)])
		.toSorted(([a = ''], [b = '']) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join('&')
	const path = url.pathname
		.split('/')
		.map((part) => encoded(decodeURIComponent(part)))
	const canonical = [
		method,
		path.join('/'),
		canonicalQuery,
		names.map((name) => `${name}:${headers.get(name)}\n`).join(''),
		signed,
		'UNSIGNED-PAYLOAD',
	].join('\n')
	const digest = createHash('sha256').update(canonical).digest('hex')
	const toSign = ['AWS4-HMAC-SHA256', stamp, scope, digest].join('\n')
	const key = ['s3', 'aws4_request'].reduce(
		hmac,
		hmac(hmac(`AWS4${signer.secretAccessKey}`, day), signer.region),
	)
	const signature = createHmac('sha256', key).update(toSign).digest('hex')
	return `${url.origin}${path.join('/')}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
