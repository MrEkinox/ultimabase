// files' application for tests (D-152): a post with a public image cover,
// its inline value and its variant, a required document and a list of
// attachments, on `memoryFiles()`.
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Identity, Logger } from 'ultimabase'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import { z } from 'zod'
import type { FilesOptions } from '../index.ts'
import { file, filesPlugin, memoryFiles } from '../index.ts'

export const M = { as: master }
export const alice: Identity = { kind: 'user', user: { id: 'alice' } }
export const bob: Identity = { kind: 'user', user: { id: 'bob' } }

/** A 1×1 PNG. */
export const png: Uint8Array = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	),
	(char) => char.charCodeAt(0),
)
export const pdf: Uint8Array = new TextEncoder().encode(
	'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
)
export const text: Uint8Array = new TextEncoder().encode('a,b\n1,2\n')

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		cover: file({
			optional: true,
			accept: ['image/*'],
			public: true,
			inline: {
				first: ({ body }) => body[0] ?? 0,
				named: { run: ({ name }) => name, schema: z.string() },
			},
			variants: {
				thumb: ({ body }) => ({ body: body.slice(0, 16), type: 'image/webp' }),
			},
		}),
		doc: file({ optional: true, accept: ['application/pdf', 'text/csv'] }),
		attachments: file({ list: true, maxSize: 1024 }),
	}),
}).with({
	access: {
		read: allow.public,
		create: allow.public,
		update: allow.public,
		delete: allow.public,
	},
})

// Fields whose upload fails: a variant that throws, inline values too large
// or not of their schema.
export const Failing = defineModel({
	name: 'Failing',
	fields: () => ({
		image: file({
			optional: true,
			variants: {
				thumb: () => {
					throw new Error('No thumbnail.')
				},
			},
		}),
		large: file({ optional: true, inline: { big: () => 'x'.repeat(3000) } }),
		typed: file({
			optional: true,
			inline: { count: { run: () => 'one', schema: z.number() } },
		}),
	}),
})

export function logging(warnings: unknown[]): Logger {
	const logger: Logger = {
		info: () => undefined,
		warn: (first) => {
			warnings.push(first)
		},
		error: () => undefined,
		child: () => logger,
	}
	return logger
}

/** A started application on a free port, and its storage. */
export async function started(
	options: Partial<FilesOptions> = {},
	database: Adapter = memory(),
) {
	const storage = memoryFiles()
	const warnings: unknown[] = []
	const app = defineApp({
		database,
		plugins: [httpPlugin({ port: 0 }), filesPlugin({ storage, ...options })],
		models: [Post, Failing],
		logger: logging(warnings),
	})
	await app.start()
	return { app, storage, warnings }
}
