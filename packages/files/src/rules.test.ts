// A file field's upload rules of the caller (D-402): its size, its types
// and its check, computed for who uploads.
import { afterEach, describe, expect, it } from 'vitest'
import { files } from './index.ts'
import { FilesBlob } from './model.ts'
import { alice, bob, M, pdf, png, started } from './test/app.ts'
import { upload } from './upload.ts'

type Started = Awaited<ReturnType<typeof started>>
let running: Started | undefined

afterEach(async () => {
	await running?.app.stop()
	running = undefined
})

async function start(): Promise<Started> {
	running = await started()
	return running
}

/** The test PNG, then `tail`: still a PNG to the type detection. */
const pngWith = (tail: Uint8Array): Uint8Array =>
	Uint8Array.from([...png, ...tail])
/** A PNG of 150 bytes: over the 100 of the free plan, under Alice's 1 KB. */
const large = pngWith(new Uint8Array(150 - png.length))
/** A PNG the test application's check reads as moving. */
const moving = pngWith(new TextEncoder().encode('acTL'))

const avatar = (body: Uint8Array, as = bob) =>
	files.upload(body, { for: 'Avatar.image', name: 'a', as })

describe('a file field with rules of the caller', () => {
	it('limits the size the caller is given, before the body is read', async () => {
		await start()
		await expect(avatar(large)).rejects.toMatchObject({
			code: 'PAYLOAD_TOO_LARGE',
			message: 'The file is over 100 bytes.',
		})
		expect((await avatar(large, alice)).id).toBeTypeOf('string')
		// A body that fails once read: the refusal comes before.
		const unread = new ReadableStream<Uint8Array>({
			pull: () => {
				throw new Error('The body was read.')
			},
		})
		await expect(
			upload(unread, 150, { for: 'Avatar.image', name: 'a', as: bob }),
		).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
	})

	it('accepts the types the caller is given', async () => {
		await start()
		await expect(avatar(pdf)).rejects.toMatchObject({
			code: 'UNSUPPORTED_MEDIA_TYPE',
			message: 'application/pdf is not accepted.',
		})
		expect((await avatar(pdf, alice)).id).toBeTypeOf('string')
	})

	it("answers with the check's refusal, and stores nothing", async () => {
		const { storage } = await start()
		await expect(avatar(moving)).rejects.toMatchObject({
			code: 'ANIMATED_IMAGE',
			message: 'Animated images need a plan.',
		})
		expect(await FilesBlob.findMany({}, M)).toStrictEqual([])
		expect(storage.objects.size).toBe(0)
		expect((await avatar(png)).id).toBeTypeOf('string')
		expect((await avatar(moving, alice)).id).toBeTypeOf('string')
	})

	it('runs the rules for Master too', async () => {
		await start()
		await expect(avatar(pdf, M.as)).rejects.toMatchObject({
			code: 'UNSUPPORTED_MEDIA_TYPE',
		})
	})

	it("fails as the application's error when a rule gives no size or no types", async () => {
		await start()
		await expect(
			files.upload(png, { for: 'Avatar.noSize', name: 'a', as: bob }),
		).rejects.toThrow("Avatar.noSize's maxSize gave no number of bytes.")
		await expect(
			files.upload(png, { for: 'Avatar.noTypes', name: 'a', as: bob }),
		).rejects.toThrow("Avatar.noTypes's accept gave no list of MIME types.")
	})
})
