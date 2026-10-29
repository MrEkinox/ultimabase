// A file field (D-152): the options `file()` refuses, the JSON clients read
// and the shape REST and GraphQL type it with.
import type { ExposedModel, PluginTypes } from 'ultimabase'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, definePlugin, memory } from 'ultimabase'
import { afterEach, describe, expect, it } from 'vitest'
import { file, files, filesPlugin, memoryFiles } from './index.ts'
import { alice, logging, M, png, Post } from './test/app.ts'
import { fileJson, fileValue, Pending, storedFile } from './values.ts'

interface Probe extends PluginTypes {
	readonly name: 'probe'
}
/** What the probe reads of the application's models. */
let models: readonly ExposedModel[] = []
const probe = definePlugin<Probe>({
	name: 'probe',
	manifest: {
		name: 'test-probe',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	start: (context) => {
		models = context.models
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function start(): Promise<void> {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			filesPlugin({ storage: memoryFiles() }),
			probe.plugin(),
		],
		models: [Post],
		logger: logging([]),
	})
	await app.start()
	stop = async () => app.stop()
}

const typeOf = (field: string) => {
	const type = models.find(({ schema }) => schema.name === 'Post')?.fieldTypes[
		field
	]
	if (type === undefined) throw new Error(`No Post.${field}.`)
	return type
}

const output = (field: string): unknown => {
	const { shape } = typeOf(field)
	const standard: unknown = shape?.['~standard']
	if (typeof standard !== 'object' || standard === null) return undefined
	const exporter: unknown = Reflect.get(standard, 'jsonSchema')
	if (typeof exporter !== 'object' || exporter === null) return undefined
	const run: unknown = Reflect.get(exporter, 'output')
	return typeof run === 'function'
		? Reflect.apply(run, exporter, [])
		: undefined
}

const string = { type: 'string' }
const size = { type: 'integer', minimum: 0 }
const closed = (properties: { readonly [key: string]: unknown }) => ({
	type: 'object',
	properties,
	required: Object.keys(properties),
	additionalProperties: false,
})
const nullable = (node: unknown) => ({ anyOf: [node, { type: 'null' }] })
const fileNode = (
	inline: { readonly [key: string]: unknown },
	variants: { readonly [key: string]: unknown },
) =>
	closed({
		id: string,
		name: string,
		type: string,
		size,
		url: string,
		inline: closed(inline),
		variants: closed(variants),
	})

describe('file()', () => {
	it('refuses a list that is optional', () => {
		expect(() => file({ list: true, optional: true })).toThrow(
			'A file list is empty, never null: list or optional.',
		)
	})

	it('refuses a maxSize that is not a number of bytes', () => {
		expect(() => file({ maxSize: 0 })).toThrow('maxSize is a number of bytes')
		expect(() => file({ maxSize: 1.5 })).toThrow('maxSize is a number of bytes')
	})

	it('refuses an accept that is not a MIME type', () => {
		expect(() => file({ accept: ['image'] })).toThrow('accept lists MIME types')
	})

	it('refuses an inline value or a variant that is not a function', () => {
		const inline = { size: 3 }
		const variants = { thumb: 'small' }
		// @ts-expect-error: an inline value is a function, or its run and schema.
		expect(() => file({ inline })).toThrow('inline size is a function')
		// @ts-expect-error: a variant is a function.
		expect(() => file({ variants })).toThrow('variant thumb is a function')
	})
})

describe('a file field', () => {
	it('gives its shape, each inline value typed by its schema', async () => {
		await start()
		const variant = nullable(closed({ type: string, size, url: string }))
		const cover = fileNode(
			{ first: {}, named: nullable(string) },
			{ thumb: variant },
		)
		expect(output('cover')).toStrictEqual(nullable(cover))
		expect(output('doc')).toStrictEqual(nullable(fileNode({}, {})))
		expect(output('attachments')).toStrictEqual({
			type: 'array',
			items: fileNode({}, {}),
		})
		const checked = await typeOf('cover').shape?.['~standard'].validate(1)
		expect(checked).toStrictEqual({ value: 1 })
	})

	it('gives clients its files, with their URLs', async () => {
		await start()
		const { id } = await files.upload(png, {
			for: 'Post.attachments',
			name: 'a.png',
			as: alice,
		})
		const post = await Post.create(
			{ data: { title: 'A', attachments: [id] } },
			{ as: alice },
		)
		expect(typeOf('attachments').toJSON(post.attachments)).toStrictEqual([
			{
				id,
				name: 'a.png',
				type: 'image/png',
				size: png.length,
				url: post.attachments[0]?.url,
				inline: {},
				variants: {},
			},
		])
		expect(typeOf('cover').toJSON(new Pending('set', [id]))).toBeNull()
		await Post.delete({ where: { id: post.id } }, M)
	})

	it('reads null for a variant its stored copy lacks', async () => {
		await start()
		const stored = storedFile(
			{
				id: 'f',
				key: 'public/f',
				name: 'a.png',
				type: 'image/png',
				size: 1,
				inline: {},
				variants: {},
			},
			'A test',
		)
		const value = fileValue(stored, { inline: ['first'], variants: ['thumb'] })
		expect(fileJson(value)).toMatchObject({
			inline: { first: null },
			variants: { thumb: null },
		})
	})

	it('refuses a row whose copy is not a file', () => {
		expect(() => storedFile({ id: 'f' }, 'A test')).toThrow(
			'A test: the row holds a file that is not one.',
		)
	})
})
