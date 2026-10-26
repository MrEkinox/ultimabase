// Plugin field types over GraphQL (D-122): read as `toJSON` gives and
// written through `schema`, as `JSON`; never filtered nor sorted.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { printType } from 'graphql'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFieldType,
	defineModel,
	definePlugin,
	memory,
} from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { z } from 'zod'
import { graphql, graphqlPlugin } from './index.ts'
import { asMaster, post } from './test/app.ts'

interface Tags extends PluginTypes {
	readonly name: 'tags'
}
const tags = definePlugin<Tags>({
	name: 'tags',
	manifest: {
		name: 'test-tags',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
})

/** Tags a client sends as a list, which code reads as a Set. */
const tagSet = defineFieldType({
	plugin: 'tags',
	stored: (f) => f.string({ list: true }),
	decode: (stored) => new Set(stored),
	encode: (value) => [...value].toSorted(),
	schema: z
		.array(z.string())
		.or(z.set(z.string()))
		.transform((value) => new Set(value)),
	toJSON: (value) => [...value].toSorted(),
})

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({ body: f.string(), labels: tagSet({ default: ['draft'] }) }),
}).with({ access: allow.readOnly })

let schema: GraphQLSchema | undefined
let url = ''
const lines: unknown[] = []
const logger: Logger = {
	info: (first) => {
		lines.push(first)
	},
	warn: () => {},
	error: () => {},
	child: () => logger,
}
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ port: 0 }),
		tags.plugin(),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Note],
	masterKey: 'secret',
	logger,
})
beforeAll(async () => {
	await app.start()
	const line = lines.find(
		(first) => typeof first === 'string' && first.startsWith('Listening on'),
	)
	url = `${String(line).replace(/^Listening on (.*)\.$/, '$1')}/graphql`
})
afterAll(async () => app.stop())

const typeOf = (name: string): string => {
	const type = schema?.getType(name)
	return type === undefined ? 'none' : printType(type)
}

it('reads and writes JSON, and leaves it out of filters and sorts', () => {
	expect(typeOf('Note')).toContain('  labels: JSON!\n')
	expect(typeOf('NoteCreateInput')).toContain('  labels: JSON\n')
	expect(typeOf('NoteWhereInput')).not.toContain('labels')
	expect(typeOf('NoteOrderByInput')).not.toContain('labels')
})

it('writes through its schema and reads its toJSON', async () => {
	const created = await post(
		url,
		`mutation { a: createNote(data: { body: "a", labels: ["b", "a"] }) { labels }
			b: createNote(data: { body: "b" }) { labels } }`,
		undefined,
		asMaster,
	)
	expect(created).toStrictEqual({
		data: { a: { labels: ['a', 'b'] }, b: { labels: ['draft'] } },
	})
	const refused = await post(
		url,
		`mutation { createNote(data: { body: "c", labels: [1] }) { labels } }`,
		undefined,
		asMaster,
	)
	expect(refused).toMatchObject({
		errors: [{ extensions: { code: 'VALIDATION_FAILED' } }],
	})
})
