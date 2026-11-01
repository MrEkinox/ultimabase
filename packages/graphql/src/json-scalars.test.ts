// A json schema named as a GraphQL scalar (D-190): `scalar: true`, named by
// its id, from Zod's `$defs` or an `id` keyword, or by its path.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { printType } from 'graphql'
import type { Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	memory,
} from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { graphql, graphqlPlugin } from './index.ts'
import { asMaster, post } from './test/app.ts'

type TiptapNode = {
	readonly type: string
	readonly text?: string | undefined
	readonly content?: readonly TiptapNode[] | undefined
}
const TiptapNode: z.ZodType<TiptapNode> = z.object({
	type: z.string(),
	text: z.string().optional(),
	get content() {
		return z.array(TiptapNode).optional()
	},
})
const RichText = z
	.object({ type: z.literal('doc'), content: z.array(TiptapNode) })
	.meta({ id: 'RichText', scalar: true, description: 'A Tiptap document' })

/** A Standard Schema whose JSON Schema export is `json`, on both sides. */
function exporting(json: object) {
	const standard = {
		version: 1 as const,
		vendor: 'test',
		validate: (value: unknown) => ({ value }),
		jsonSchema: { input: () => json, output: () => json },
	}
	return { '~standard': standard }
}

// As Valibot's `v.metadata` and ArkType's `.configure` write an id.
const Plain = exporting({
	type: 'object',
	id: 'Plain',
	scalar: true,
	properties: { a: { type: 'string' } },
})
const Maybe = exporting({ type: ['object', 'null'], id: 'Maybe', scalar: true })
const Either = exporting({
	anyOf: [{ type: 'object' }, { type: 'null' }],
	id: 'Either',
	scalar: true,
})
const Point = exporting({
	type: 'object',
	id: 'Point',
	properties: { x: { type: 'number' } },
	required: ['x'],
})

// Without an id, a scalar is named by its path, as an object type is.
const Unnamed = z.object({ theme: z.string() }).meta({ scalar: true })

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({
		body: f.json({ optional: true, validate: RichText }),
		page: f.json({ validate: z.object({ title: z.string(), body: RichText }) }),
		plain: f.json({ optional: true, validate: Plain }),
		maybe: f.json({ validate: Maybe }),
		either: f.json({ validate: Either }),
		point: f.json({ optional: true, validate: Point }),
		settings: f.json({ optional: true, validate: Unnamed }),
		layout: f.json({ optional: true, validate: z.object({ panel: Unnamed }) }),
	}),
}).with({ access: allow.public })

const render = defineFunction({
	name: 'render',
	input: RichText,
	output: z.object({ doc: RichText, words: z.int() }),
	run: ({ input }) => ({ doc: input, words: input.content.length }),
}).with({ access: allow.public })

const loggerOf = (lines: unknown[]): Logger => {
	const logger: Logger = {
		info: (first) => {
			lines.push(first)
		},
		warn: () => {},
		error: () => {},
		child: () => logger,
	}
	return logger
}

let schema: GraphQLSchema | undefined
const lines: unknown[] = []
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ port: 0 }),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Note],
	functions: [render],
	masterKey: 'secret',
	logger: loggerOf(lines),
})
let url = ''

const typeOf = (name: string): string => {
	const type = schema?.getType(name)
	return type === undefined ? 'none' : printType(type)
}

describe('a schema named as a scalar', () => {
	beforeAll(async () => {
		await app.start()
		const line = lines.find(
			(first) => typeof first === 'string' && first.startsWith('Listening on'),
		)
		url = `${String(line).replace(/^Listening on (.*)\.$/, '$1')}/graphql`
	})
	afterAll(async () => app.stop())

	it('is one scalar, described by its schema', () => {
		expect(typeOf('RichText')).toBe('"""A Tiptap document"""\nscalar RichText')
		expect(typeOf('RichTextInput')).toBe('none')
		expect(typeOf('Plain')).toBe('scalar Plain')
	})

	it('types a field at its root or deeper, on both sides', () => {
		expect(typeOf('Note')).toContain(
			'  body: RichText\n  page: NotePage!\n  plain: Plain\n  maybe: Maybe\n  either: Either\n  point: Point\n',
		)
		expect(typeOf('NotePage')).toBe(
			'type NotePage {\n  title: String!\n  body: RichText!\n}',
		)
		expect(typeOf('NotePageInput')).toBe(
			'input NotePageInput {\n  title: String!\n  body: RichText!\n}',
		)
		expect(typeOf('NoteCreateInput')).toContain(
			'  body: RichText\n  page: NotePageInput!\n  plain: Plain\n  maybe: Maybe!\n  either: Either!\n  point: PointInput\n',
		)
		expect(typeOf('NoteWhereInput')).toContain('  body: JSONFilter\n')
	})

	it('names a scalar without an id by its path, on both sides', () => {
		expect(typeOf('NoteSettings')).toBe('scalar NoteSettings')
		expect(typeOf('NoteLayoutPanel')).toBe('scalar NoteLayoutPanel')
		expect(typeOf('NoteSettingsInput')).toBe('none')
		expect(typeOf('Note')).toContain(
			'  settings: NoteSettings\n  layout: NoteLayout\n',
		)
		expect(typeOf('NoteCreateInput')).toContain(
			'  settings: NoteSettings\n  layout: NoteLayoutInput\n',
		)
		expect(typeOf('NoteLayoutInput')).toBe(
			'input NoteLayoutInput {\n  panel: NoteLayoutPanel!\n}',
		)
	})

	it('names a shared object type by its id keyword', () => {
		expect(typeOf('Point')).toBe('type Point {\n  x: Float!\n}')
		expect(typeOf('PointInput')).toBe('input PointInput {\n  x: Float!\n}')
	})

	it("types a function's input and output, the input taken whole", () => {
		expect(typeOf('Mutation')).toContain(
			'  render(input: RichText!): RenderOutput!\n',
		)
		expect(typeOf('RenderOutput')).toBe(
			'type RenderOutput {\n  doc: RichText!\n  words: Int!\n}',
		)
	})

	it('writes and reads a value whole', async () => {
		const doc = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
		}
		const created = await post(
			url,
			`mutation($doc: RichText!) {
				createNote(data: { body: $doc, page: { title: "a", body: { type: "doc", content: [] } }, maybe: {}, either: {} }) {
					body page { body } } }`,
			{ doc },
			asMaster,
		)
		expect(created).toStrictEqual({
			data: {
				createNote: { body: doc, page: { body: { type: 'doc', content: [] } } },
			},
		})
		const rendered = await post(
			url,
			`mutation { render(input: { type: "doc", content: [{ type: "text", text: "x" }] }) { doc words } }`,
		)
		expect(rendered).toStrictEqual({
			data: {
				render: {
					doc: { type: 'doc', content: [{ type: 'text', text: 'x' }] },
					words: 1,
				},
			},
		})
		const refused = await post(
			url,
			`mutation { createNote(data: { body: { type: "page" }, page: { title: "b", body: { type: "doc", content: [] } }, maybe: {}, either: {} }) { id } }`,
			undefined,
			asMaster,
		)
		expect(refused.errors?.[0]).toMatchObject({
			extensions: { code: 'VALIDATION_FAILED' },
		})
	})
})

/** Starts and stops an application of `models`, rejecting a refusal. */
async function serving(
	models: Parameters<typeof defineApp>[0]['models'],
	functions: Parameters<typeof defineApp>[0]['functions'] = [],
) {
	const started = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), graphqlPlugin()],
		models,
		functions,
		logger: loggerOf([]),
	})
	await started.start()
	await started.stop()
}

const holding = (
	name: string,
	validate: z.ZodType | ReturnType<typeof exporting>,
) =>
	defineModel({
		name,
		fields: (f) => ({ body: f.json({ validate }) }),
	})

describe('startup', () => {
	it('refuses one name given two schemas, naming both owners', async () => {
		const other = z
			.object({ b: z.string() })
			.meta({ id: 'Plain', scalar: true })
		await expect(
			serving([holding('Doc', Plain), holding('Page', other)]),
		).rejects.toThrow(
			'Doc.body and Page.body give the type Plain two shapes; name each once.',
		)
		// The same top node, another node within.
		const Leaf = z.object({ kind: z.string() })
		const Tree = z
			.object({ type: z.literal('doc'), content: z.array(Leaf) })
			.meta({ id: 'RichText', scalar: true, description: 'A Tiptap document' })
		await expect(
			serving([holding('Doc', RichText), holding('Page', Tree)]),
		).rejects.toThrow(
			'Doc.body and Page.body give the type RichText two shapes; name each once.',
		)
	})

	it('refuses a scalar named like an object type or a model', async () => {
		const object = z.object({ a: z.string() }).meta({ id: 'Plain' })
		await expect(
			serving([holding('Doc', object), holding('Page', Plain)]),
		).rejects.toThrow(
			'Doc.body and Page.body give the type Plain two shapes; name each once.',
		)
		await expect(
			serving([holding('Doc', Plain), holding('Page', object)]),
		).rejects.toThrow(
			'Doc.body and Page.body give the type Plain two shapes; name each once.',
		)
		await expect(serving([holding('Plain', Plain)])).rejects.toThrow(
			'Plain.body: the type Plain is named like a model.',
		)
		const json = exporting({ type: 'object', id: 'JSON', scalar: true })
		await expect(serving([holding('Doc', json)])).rejects.toThrow(
			"Doc.body: the type JSON is a generated type's name.",
		)
	})

	it('shares one scalar between fields and functions', async () => {
		const echo = defineFunction({
			name: 'echo',
			input: z.object({ doc: RichText }),
			output: RichText,
			run: ({ input }) => input.doc,
		}).with({ access: allow.public })
		await expect(
			serving([holding('Doc', RichText), holding('Page', RichText)], [echo]),
		).resolves.toBeUndefined()
	})
})
