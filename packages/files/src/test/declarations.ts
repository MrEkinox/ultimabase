// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { file, filesPlugin, memoryFiles } from '@ultimabase/files'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, defineModel, memory } from 'ultimabase'
import { z } from 'zod'

export const Post = defineModel({
	name: 'Post',
	fields: () => ({
		cover: file({
			optional: true,
			accept: ['image/*'],
			inline: { named: { run: ({ name }) => name, schema: z.string() } },
			variants: { thumb: ({ body }) => ({ body, type: 'image/webp' }) },
		}),
		attachments: file({ list: true }),
	}),
})

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin(), filesPlugin({ storage: memoryFiles() })],
	models: [Post],
})
