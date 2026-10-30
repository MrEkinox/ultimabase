// The model: a post with a cover image, public, and private text
// attachments.
//#region post
import { file } from '@ultimabase/files'
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel } from 'ultimabase'
import { z } from 'zod'

export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		cover: file({
			optional: true,
			accept: ['image/png'],
			maxSize: 5_000_000,
			// A stable URL, which a CDN may cache.
			public: true,
			// Computed once at upload, and read with the post.
			inline: {
				size: {
					run: ({ body }) => pngSize(body),
					schema: z.object({ width: z.int(), height: z.int() }).nullable(),
				},
			},
		}),
		attachments: file({
			list: true,
			// Text is not detected from its bytes: these types are taken as
			// declared, and served as downloads.
			accept: ['text/plain', 'text/csv'],
			maxSize: 100_000,
			// A file of its own, made at upload: the first 100 bytes.
			variants: {
				preview: ({ body }) => ({
					body: body.slice(0, 100),
					type: 'text/plain',
				}),
			},
		}),
	}),
	// Open to every client, to keep the example on files.
}).with({ access: allow.public })
//#endregion

//#region png-size
const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A PNG's width and height, from its header; `null` for other bytes. */
function pngSize(body: Uint8Array) {
	// `accept` lists image/png as is, so a body declared image/png whose
	// type is not detected comes in too, and is served as a download.
	const isPng =
		body.length >= 24 && signature.every((byte, i) => body[i] === byte)
	if (!isPng) return null
	const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
	return { width: view.getUint32(16), height: view.getUint32(20) }
}
//#endregion
