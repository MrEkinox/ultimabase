// `POST /files?for=Post.cover&name=photo.jpg` (D-152): the file as the raw
// body, which its field's `maxSize` limits, not the HTTP plugin (D-153); and
// `GET /files/<key>`, for a storage the application serves (D-202).
import type { Routes } from '@ultimabase/http'
import { routes } from '@ultimabase/http'
import { PublicError } from 'ultimabase'
import { keyPattern } from './storage.ts'
import { upload } from './upload.ts'

/** An upload's own refusals, which the HTTP plugin does not know. */
const statuses: ReadonlyMap<string, 413 | 415> = new Map([
	['PAYLOAD_TOO_LARGE', 413],
	['UNSUPPORTED_MEDIA_TYPE', 415],
] as const)

/** The upload route, which the plugin mounts without the body limit. */
export const uploads = (): Routes =>
	routes().post('/files', async (c) => {
		const length = c.req.header('content-length')
		if (length === undefined) {
			return c.json(
				{ code: 'LENGTH_REQUIRED', message: 'Content-Length is required.' },
				411,
			)
		}
		try {
			const { id } = await upload(
				c.req.raw.body ?? new Uint8Array(),
				Number(length),
				{
					for: c.req.query('for') ?? '',
					name: c.req.query('name') ?? '',
					type: c.req.header('content-type'),
					as: c.var.caller,
				},
			)
			return c.json({ id }, 201)
		} catch (error) {
			if (!(error instanceof PublicError)) throw error
			const status = statuses.get(error.code)
			if (status === undefined) throw error
			return c.json({ code: error.code, message: error.message }, status)
		}
	})

/** The route of a storage's files, which `serve` answers. */
export const served = (
	serve: (key: string, url: URL) => Promise<Response>,
): Routes =>
	routes().get('/files/:visibility/:id', async (c) => {
		const key = `${c.req.param('visibility')}/${c.req.param('id')}`
		if (!keyPattern.test(key)) {
			return c.json(
				{ code: 'NOT_FOUND', message: 'No file at this address.' },
				404,
			)
		}
		return serve(key, new URL(c.req.url))
	})
