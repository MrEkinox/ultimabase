// A storage's files served by the application (D-202): their URLs, a
// private one signed for D-200's window, and the answer's headers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredObject } from './served.ts'
import { serving } from './served.ts'

const object: StoredObject = {
	body: new TextEncoder().encode('hello'),
	size: 5,
	type: 'text/plain',
	attachment: false,
}
const found = async () => object
const missing = async () => undefined

afterEach(() => {
	vi.useRealTimers()
})

describe('serving()', () => {
	it('gives a URL once the application starts', () => {
		const served = serving('memoryFiles', {})
		expect(() => served.url('public/a')).toThrow(
			"memoryFiles gives a file's URL once the application starts.",
		)
	})

	it('starts its URLs with servedAt, else the HTTP address', () => {
		const at = serving('memoryFiles', {
			servedAt: 'https://files.example.com/',
		})
		at.start({ url: 'http://localhost:3000' })
		expect(at.url('public/a')).toBe('https://files.example.com/files/public/a')
		const local = serving('memoryFiles', {})
		local.start({ url: 'http://localhost:3000' })
		expect(local.url('public/a')).toBe('http://localhost:3000/files/public/a')
	})

	it('signs a private URL, the same for 15 minutes, valid 30', async () => {
		vi.useFakeTimers({ now: Date.UTC(2026, 10, 2, 10, 16) })
		const served = serving('diskFiles', { secret: 's'.repeat(32) })
		served.start({ url: 'http://localhost:3000' })
		const url = new URL(served.url('private/b'))
		expect(url.searchParams.get('expires')).toBe(
			String(Date.UTC(2026, 10, 2, 10, 45) / 1000),
		)
		vi.setSystemTime(Date.UTC(2026, 10, 2, 10, 29))
		expect(served.url('private/b')).toBe(url.href)
		const response = await served.serve('private/b', url, found)
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, max-age=960')
		expect(await response.text()).toBe('hello')
		vi.setSystemTime(Date.UTC(2026, 10, 2, 10, 45))
		const expired = await served.serve('private/b', url, found)
		expect(expired.status).toBe(403)
	})

	it('refuses a private file without its signature, or with another', async () => {
		const served = serving('memoryFiles', {})
		served.start({ url: 'http://localhost:3000' })
		const url = new URL(served.url('private/b'))
		const other = new URL(url.href.replace('private/b', 'private/c'))
		const bare = new URL('http://localhost:3000/files/private/b')
		for (const [key, at] of [
			['private/c', other],
			['private/b', bare],
		] as const) {
			const response = await served.serve(key, at, found)
			expect(response.status).toBe(403)
			expect(await response.json()).toStrictEqual({
				code: 'FORBIDDEN',
				message: 'This file URL is not signed, or has expired.',
			})
		}
	})

	it('serves a public file with its type, sandboxed and cached', async () => {
		const served = serving('memoryFiles', {})
		served.start({ url: 'http://localhost:3000' })
		const response = await served.serve(
			'public/a',
			new URL(served.url('public/a')),
			async () => ({ ...object, type: 'image/svg+xml', attachment: true }),
		)
		expect(Object.fromEntries(response.headers)).toStrictEqual({
			'cache-control': 'public, max-age=31536000, immutable',
			'content-disposition': 'attachment',
			'content-length': '5',
			'content-security-policy': 'sandbox',
			'content-type': 'image/svg+xml',
			'x-content-type-options': 'nosniff',
		})
	})

	it('answers 404 for a file it does not hold', async () => {
		const served = serving('memoryFiles', {})
		served.start({ url: 'http://localhost:3000' })
		const response = await served.serve(
			'public/a',
			new URL(served.url('public/a')),
			missing,
		)
		expect(response.status).toBe(404)
		expect(await response.json()).toStrictEqual({
			code: 'NOT_FOUND',
			message: 'No file at this address.',
		})
	})
})
