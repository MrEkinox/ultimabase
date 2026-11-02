// `diskFiles({ dir, secret })` (D-202): objects in a directory, their type
// beside them, a body of the wrong size never stored.
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diskFiles } from './disk.ts'

const secret = 's'.repeat(32)
const a = 'public/00000000-0000-4000-8000-00000000000a'
const b = 'private/00000000-0000-4000-8000-00000000000b'
const options = { type: 'text/plain', size: 5, attachment: false }
let dir = ''

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'disk-files-'))
})
afterEach(async () => {
	await rm(dir, { recursive: true, force: true })
})

function started() {
	const storage = diskFiles({ dir, secret })
	storage.start({ url: 'http://localhost:3000' })
	return storage
}

describe('diskFiles()', () => {
	it('refuses a missing dir or a short secret when the application starts', () => {
		const server = { url: 'http://localhost:3000' }
		expect(() => {
			diskFiles({ dir: undefined, secret }).start(server)
		}).toThrow('diskFiles() needs dir: undefined or empty.')
		for (const short of [undefined, 'short']) {
			expect(() => {
				diskFiles({ dir, secret: short }).start(server)
			}).toThrow('diskFiles() needs a secret of 32 characters at least.')
		}
	})

	it('stores a file, serves it, lists it and deletes it', async () => {
		const storage = started()
		await storage.put(a, new Blob(['hello']).stream(), options)
		await storage.put(b, new TextEncoder().encode('world'), {
			...options,
			attachment: true,
		})
		expect((await storage.keys()).toSorted()).toStrictEqual([b, a])
		const url = new URL(storage.url(b))
		const response = await storage.serve?.(b, url)
		expect(response?.headers.get('content-type')).toBe('text/plain')
		expect(response?.headers.get('content-disposition')).toBe('attachment')
		expect(await response?.text()).toBe('world')
		await storage.delete(b)
		await storage.delete(b)
		expect(await storage.keys()).toStrictEqual([a])
		const gone = await storage.serve?.(b, url)
		expect(gone?.status).toBe(404)
	})

	it('stores no body of another size than given', async () => {
		const storage = started()
		await expect(
			storage.put(a, new TextEncoder().encode('hell'), options),
		).rejects.toThrow(`diskFiles: ${a} has 4 bytes, not 5.`)
		await expect(
			storage.put(a, new Blob(['hello!']).stream(), options),
		).rejects.toThrow(`diskFiles: ${a} has over 5 bytes.`)
		expect(await readdir(join(dir, 'public'))).toStrictEqual([])
	})

	it('refuses a key that is not a file key', async () => {
		const storage = started()
		await expect(
			storage.put('../a', new Uint8Array(), { ...options, size: 0 }),
		).rejects.toThrow('diskFiles: ../a is not a file key.')
		expect(() => storage.url('public/../../a')).toThrow(
			'diskFiles: public/../../a is not a file key.',
		)
	})

	it('ignores what is not a file, and fails on a type it cannot read', async () => {
		const storage = started()
		await writeFile(join(dir, 'public', 'notes.txt'), '')
		expect(await storage.keys()).toStrictEqual([])
		await writeFile(join(dir, `${a}.json`), '{}')
		await writeFile(join(dir, a), 'hello')
		await expect(storage.serve?.(a, new URL(storage.url(a)))).rejects.toThrow(
			`diskFiles: ${a}.json is not a file's type.`,
		)
	})
})
