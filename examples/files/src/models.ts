// The model: a post with a cover image, public, private text attachments,
// and an avatar whose rules depend on the uploader's plan.
//#region imports
import { file } from '@ultimabase/files'
import { graphql } from '@ultimabase/graphql'
import type { Caller } from 'ultimabase'
import { allow, defineModel, PublicError } from 'ultimabase'
import { z } from 'zod'
//#endregion

//#region plans
// Here a list; an application reads its subscriptions.
const subscribers = new Set(['ada'])
const subscribed = (caller: Caller) =>
	caller.kind === 'user' && subscribers.has(caller.user.id)
//#endregion

export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		//#region cover
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
		//#endregion
		//#region attachments
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
		//#endregion
		//#region avatar
		avatar: file({
			optional: true,
			accept: ['image/png', 'image/gif'],
			// 5 MB for a subscriber, 500 KB for anyone else, before the body
			// is read.
			maxSize: ({ caller }) => (subscribed(caller) ? 5_000_000 : 500_000),
			// Once the file is read, before it is stored: the application
			// refuses what it wants, here an animated GIF on the free plan.
			check: ({ body, caller }) => {
				if (isAnimatedGif(body) && !subscribed(caller)) {
					throw new PublicError(
						'ANIMATED_IMAGE',
						'Animated images need a plan.',
					)
				}
			},
		}),
		//#endregion
	}),
	// Open to every client, to keep the example on files.
}).with({ access: allow.public })

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

//#region animated
/**
 * Whether a GIF loops, as nearly every animated GIF does: it carries the
 * NETSCAPE2.0 extension. An image library, such as sharp and its `pages`,
 * counts the frames of any format.
 */
const isAnimatedGif = (body: Uint8Array) =>
	new TextDecoder('latin1').decode(body).includes('NETSCAPE2.0')
//#endregion
