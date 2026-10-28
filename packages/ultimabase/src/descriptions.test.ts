// Descriptions (D-150): what a model, a field, a function and a type mean,
// given to the transports and changing nothing else.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ExposedFunction, ExposedModel, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFieldType,
	defineFunction,
	defineModel,
	definePlugin,
	defineType,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }

const label = defineFieldType({
	plugin: 'reader',
	stored: (f) => f.string(),
	decode: (stored) => stored,
	encode: (value) => value,
	schema: z.string(),
	toJSON: (value) => value,
})

const Author = defineModel({
	name: 'Author',
	description: 'Who writes the posts.',
	fields: (f) => ({
		name: f.string({ description: 'As printed.' }),
		posts: f.many(() => Post, { description: 'What they wrote.' }),
	}),
})
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		tags: f.string({ list: true, description: 'Its topics.' }),
		price: f.decimal({ precision: 6, scale: 2, description: 'In euros.' }),
		on: f.date({ description: 'Its day.' }),
		meta: f.json({ optional: true, description: 'Anything.' }),
		state: f.enumOf(['draft', 'live'], { description: 'Where it is.' }),
		author: f.one(() => Author, { optional: true, description: 'Its author.' }),
		label: label({ description: 'A label.' }),
	}),
})
const Summary = defineType({
	name: 'Summary',
	description: 'What was counted.',
	fields: { posts: z.number() },
})
const stats = defineFunction({
	name: 'stats',
	description: 'Counts the posts.',
	output: Summary,
	run: () => ({ posts: 0 }),
})

interface Reader extends PluginTypes {
	readonly name: 'reader'
}
const seen: {
	models: readonly ExposedModel[]
	functions: readonly ExposedFunction[]
} = { models: [], functions: [] }
const reader = definePlugin<Reader>({
	name: 'reader',
	manifest: {
		name: 'test-reader',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	start: ({ models, functions }) => {
		seen.models = models
		seen.functions = functions
	},
})
const options = {
	database: memory(),
	plugins: [reader.plugin()],
	models: [Author, Post],
	functions: [stats],
}

describe('descriptions', () => {
	it('are given to the transports', async () => {
		const app = defineApp(options)
		await app.start()
		const [author, post] = seen.models
		expect(author).toMatchObject({
			description: 'Who writes the posts.',
			descriptions: { name: 'As printed.', posts: 'What they wrote.' },
		})
		expect(post?.description).toBeUndefined()
		expect(post?.descriptions).toStrictEqual({
			tags: 'Its topics.',
			price: 'In euros.',
			on: 'Its day.',
			meta: 'Anything.',
			state: 'Where it is.',
			author: 'Its author.',
			label: 'A label.',
		})
		const [fn] = seen.functions
		expect(fn?.description).toBe('Counts the posts.')
		expect(fn?.output).toMatchObject({
			kind: 'type',
			type: { name: 'Summary', description: 'What was counted.' },
		})
		await app.stop()
	})

	it('change nothing the adapter stores or a query returns', async () => {
		expect(JSON.stringify(schemaOf(options))).not.toContain('description')
		const app = defineApp(options)
		await app.start()
		const created = await Post.create(
			{
				data: {
					title: 'a',
					price: '1.50',
					on: '2026-07-31',
					state: 'draft',
					label: 'x',
				},
			},
			M,
		)
		expect(created).toMatchObject({ title: 'a', tags: [], label: 'x' })
		await app.stop()
	})

	it('are non-empty strings', () => {
		const empty = 'description is a non-empty string.'
		expect(() =>
			defineModel({
				name: 'Empty',
				description: '',
				fields: (f) => ({ name: f.string() }),
			}),
		).toThrow(`Empty: ${empty}`)
		expect(() =>
			defineModel({
				name: 'Empty',
				fields: (f) => ({ name: f.string({ description: '' }) }),
			}),
		).toThrow(`A field: ${empty}`)
		expect(() =>
			defineModel({
				name: 'Empty',
				fields: (f) => ({
					// @ts-expect-error: a description is a string.
					author: f.one(() => Author, { description: 3 }),
				}),
			}),
		).toThrow(`A field: ${empty}`)
		expect(() => label({ description: '' })).toThrow(`A field: ${empty}`)
		expect(() =>
			defineType({ name: 'Empty', description: '', fields: { n: z.number() } }),
		).toThrow(`Empty: ${empty}`)
		expect(() =>
			// @ts-expect-error: a description is a string.
			defineFunction({ name: 'empty', description: null, run: () => {} }),
		).toThrow(`empty: ${empty}`)
	})
})
