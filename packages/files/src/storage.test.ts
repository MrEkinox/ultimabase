// The storages (D-152): SigV4 against AWS's own example, `s3()` against a
// fetch that answers as S3 does, and `memoryFiles()`. No test reaches a real
// storage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryFiles } from './memory.ts'
import { s3 } from './s3.ts'
import { presign } from './sigv4.ts'

const signer = {
	region: 'us-east-1',
	accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
	secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}

const options = {
	bucket: 'media',
	region: 'fra1',
	endpoint: 'https://fra1.example.com/',
	accessKeyId: 'key',
	secretAccessKey: 'secret',
}

type Sent = { readonly url: URL; readonly init: RequestInit | undefined }

describe('SigV4', () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date('2013-05-24T00:00:00Z') })
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('presigns a GET as AWS’s documentation does', () => {
		const url = presign(signer, {
			method: 'GET',
			url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
			headers: {},
			expires: 86_400,
		})
		expect(url).toBe(
			'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
		)
	})

	it('signs the headers sent and keeps the query', () => {
		const url = new URL(
			presign(signer, {
				method: 'PUT',
				url: new URL("https://s3.example.com/b/it's?list-type=2"),
				headers: { 'Content-Type': ' image/png ' },
				expires: 900,
			}),
		)
		expect(url.pathname).toBe('/b/it%27s')
		expect(url.searchParams.get('list-type')).toBe('2')
		expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
			'content-type;host',
		)
	})
})

describe('s3()', () => {
	const sent: Sent[] = []
	let answer = (_sent: Sent): Response => new Response(null)
	beforeEach(() => {
		sent.length = 0
		vi.stubGlobal(
			'fetch',
			async (input: string | URL, init?: RequestInit): Promise<Response> => {
				const request = { url: new URL(input), init }
				sent.push(request)
				return answer(request)
			},
		)
	})
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('names the options it lacks when the application starts', () => {
		const storage = s3({ ...options, bucket: undefined, secretAccessKey: '' })
		expect(() => {
			storage.start()
		}).toThrow('s3() needs bucket, secretAccessKey: undefined or empty.')
	})

	it('puts a file path-style, with its type, size, disposition and ACL', async () => {
		answer = () => new Response(null)
		const storage = s3({ ...options, publicAcl: true })
		const body = new Uint8Array([1, 2, 3])
		await storage.put('public/a', body, {
			type: 'image/svg+xml',
			size: 3,
			attachment: true,
		})
		await storage.put('private/b', body, {
			type: 'image/png',
			size: 3,
			attachment: false,
		})
		const [svg, png] = sent
		expect(svg?.url.origin + (svg?.url.pathname ?? '')).toBe(
			'https://fra1.example.com/media/public/a',
		)
		expect(svg?.init).toMatchObject({
			method: 'PUT',
			body,
			duplex: 'half',
			headers: {
				'content-type': 'image/svg+xml',
				'content-length': '3',
				'content-disposition': 'attachment',
				'x-amz-acl': 'public-read',
			},
		})
		expect(svg?.url.searchParams.get('X-Amz-SignedHeaders')).toBe(
			'content-disposition;content-type;host;x-amz-acl',
		)
		expect(png?.init?.headers).toStrictEqual({
			'content-type': 'image/png',
			'content-length': '3',
		})
	})

	it('fails with the storage’s answer', async () => {
		answer = () => new Response('<Error>AccessDenied</Error>', { status: 403 })
		const storage = s3(options)
		await expect(
			storage.put('private/a', new Uint8Array(), {
				type: 'text/plain',
				size: 0,
				attachment: false,
			}),
		).rejects.toThrow(
			's3: PUT private/a failed with 403: <Error>AccessDenied</Error>',
		)
	})

	it('deletes a file, a missing one too', async () => {
		answer = () => new Response(null, { status: 404 })
		await s3(options).delete('private/a')
		expect(sent[0]?.init?.method).toBe('DELETE')
		answer = () => new Response(null, { status: 500 })
		await expect(s3(options).delete('private/a')).rejects.toThrow(
			's3: DELETE private/a failed with 500',
		)
	})

	it('lists every key, page after page', async () => {
		answer = ({ url }) =>
			new Response(
				url.searchParams.get('continuation-token') === 'n&1'
					? '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>private/c</Key></Contents></ListBucketResult>'
					: '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>public/a&amp;b</Key></Contents><Contents><Key>private/b</Key></Contents><NextContinuationToken>n&amp;1</NextContinuationToken></ListBucketResult>',
			)
		expect(await s3(options).keys()).toStrictEqual([
			'public/a&b',
			'private/b',
			'private/c',
		])
		expect(sent[0]?.url.searchParams.get('list-type')).toBe('2')
	})

	it('gives a public file a stable URL, a private one a presigned URL', () => {
		const storage = s3(options)
		expect(storage.url('public/a')).toBe(
			'https://fra1.example.com/media/public/a',
		)
		const cdn = s3({ ...options, publicUrl: 'https://cdn.example.com/' })
		expect(cdn.url('public/a')).toBe('https://cdn.example.com/public/a')
		const url = new URL(storage.url('private/a'))
		expect(url.pathname).toBe('/media/private/a')
		expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
		expect(url.searchParams.get('X-Amz-Credential')).toMatch(
			/^key\/\d{8}\/fra1\/s3\/aws4_request$/,
		)
	})
})

describe('memoryFiles()', () => {
	it('holds objects, checks their size and lists their keys', async () => {
		const storage = memoryFiles()
		storage.start()
		const body = new Blob(['hello']).stream()
		await storage.put('public/a', body, {
			type: 'text/plain',
			size: 5,
			attachment: true,
		})
		expect(storage.objects.get('public/a')).toStrictEqual({
			body: new TextEncoder().encode('hello'),
			type: 'text/plain',
			attachment: true,
		})
		await expect(
			storage.put('private/b', new Uint8Array(2), {
				type: 'text/plain',
				size: 3,
				attachment: false,
			}),
		).rejects.toThrow('memoryFiles: private/b has 2 bytes, not 3.')
		expect(await storage.keys()).toStrictEqual(['public/a'])
		expect(storage.url('public/a')).toBe('memory://files/public/a')
		expect(storage.url('private/b')).toBe(
			'memory://files/private/b?expires=3600',
		)
		await storage.delete('public/a')
		expect(await storage.keys()).toStrictEqual([])
	})
})
