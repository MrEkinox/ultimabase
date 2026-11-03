// Deprecated fields and functions (D-216): a reason given to the transports,
// only on a field a create may leave out, changing nothing else.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ExposedFunction, ExposedModel, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFieldType,
	defineFunction,
	defineModel,
	definePlugin,
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
const note = defineFieldType({
	plugin: 'reader',
	stored: (f) => f.string({ optional: true }),
	decode: (stored) => stored,
	encode: (value) => value,
	schema: z.string(),
	toJSON: (value) => value,
})

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post, { deprecated: 'Use articles.' }),
	}),
})
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		name: f.string({ optional: true, deprecated: 'Use title.' }),
		tags: f.string({ list: true, deprecated: 'Use topics.' }),
		views: f.number({ default: 0, deprecated: 'Use reads.' }),
		state: f.enumOf(['draft', 'live'], {
			default: 'draft',
			deprecated: 'Use status.',
		}),
		meta: f.json({ optional: true, deprecated: 'Use data.' }),
		author: f.one(() => Author, { optional: true, deprecated: 'Use writer.' }),
		label: label({ default: 'none', deprecated: 'Use badge.' }),
		note: note({ deprecated: 'Use remark.' }),
		shout: f.virtual(z.string(), {
			needs: ['title'],
			deprecated: 'Upper-case it.',
		}),
	}),
}).with({
	virtuals: { shout: { run: ({ record }) => record.title.toUpperCase() } },
})
const legacyCount = defineFunction({
	name: 'legacyCount',
	deprecated: 'Use Post.count.',
	run: () => {},
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
	functions: [legacyCount],
}

const required = (at: string): string =>
	`${at}: a create must send it, so it is not deprecated. Make it optional or give it a default.`

describe('deprecated', () => {
	it('is given to the transports', async () => {
		const app = defineApp(options)
		await app.start()
		const [author, post] = seen.models
		expect(author?.deprecations).toStrictEqual({ posts: 'Use articles.' })
		expect(post?.deprecations).toStrictEqual({
			name: 'Use title.',
			tags: 'Use topics.',
			views: 'Use reads.',
			state: 'Use status.',
			meta: 'Use data.',
			author: 'Use writer.',
			label: 'Use badge.',
			note: 'Use remark.',
		})
		expect(post?.descriptions).toStrictEqual({})
		expect(post?.virtuals).toMatchObject([
			{ name: 'shout', deprecated: 'Upper-case it.' },
		])
		expect(seen.functions).toMatchObject([
			{ name: 'legacyCount', deprecated: 'Use Post.count.' },
		])
		await app.stop()
	})

	it('changes nothing the adapter stores or a query returns', async () => {
		expect(JSON.stringify(schemaOf(options))).not.toContain('deprecated')
		const app = defineApp(options)
		await app.start()
		const created = await Post.create(
			{ data: { title: 'a', name: 'b' }, select: { name: true, views: true } },
			M,
		)
		expect(created).toStrictEqual({ name: 'b', views: 0 })
		expect(await Post.count({ where: { name: 'b' } }, M)).toBe(1)
		await app.stop()
	})

	it('is refused on a field a create must send', () => {
		expect(() =>
			defineModel({
				name: 'Bad',
				fields: (f) => ({
					// @ts-expect-error: a create must send it.
					name: f.string({ deprecated: 'Use title.' }),
				}),
			}),
		).toThrow(required('Bad.name'))
		expect(() =>
			defineModel({
				name: 'Bad',
				fields: (f) => ({
					// @ts-expect-error: a create must send it.
					author: f.one(() => Author, { deprecated: 'Use writer.' }),
				}),
			}),
		).toThrow(required('Bad.author'))
		expect(() =>
			defineModel({
				name: 'Bad',
				fields: (f) => ({
					// @ts-expect-error: a create must send it.
					on: f.date({ deprecated: 'Use day.' }),
				}),
			}),
		).toThrow(required('Bad.on'))
		expect(() =>
			defineModel({
				name: 'Bad',
				// @ts-expect-error: its stored field is required.
				fields: () => ({ label: label({ deprecated: 'Use badge.' }) }),
			}),
		).toThrow(required('Bad.label'))
	})

	it('is a non-empty string', () => {
		const empty = 'deprecated is a non-empty string.'
		expect(() =>
			defineModel({
				name: 'Empty',
				fields: (f) => ({ name: f.string({ optional: true, deprecated: '' }) }),
			}),
		).toThrow(`A field: ${empty}`)
		expect(() => note({ deprecated: '' })).toThrow(`A field: ${empty}`)
		expect(() =>
			// @ts-expect-error: a reason is a string.
			defineFunction({ name: 'empty', deprecated: true, run: () => {} }),
		).toThrow(`empty: ${empty}`)
	})
})
