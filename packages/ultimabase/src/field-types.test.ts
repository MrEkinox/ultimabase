// Plugin field types (D-122): stored through a kernel field, decoded on each
// read, encoded after the hooks, filtered by a beforeFind only.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import type { FieldBuilders, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFieldType,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }
const manifest = {
	name: 'test-tags',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

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

const tagsField = tagSet()
interface Tags extends PluginTypes {
	readonly name: 'tags'
	readonly addedFields: { readonly tags: typeof tagsField }
}
/** The tag a beforeFind hides, if any. */
let hidden: string | undefined
const tags = definePlugin<Tags>({
	name: 'tags',
	manifest,
	addedFields: () => ({ tags: tagSet() }),
	addedIndexes: [{ fields: ['tags'] }],
	hooks: {
		beforeFind: ({ where }) =>
			hidden === undefined
				? undefined
				: where({ NOT: { tags: { has: hidden } } }),
	},
})

const Post = defineModel({
	name: 'Post',
	use: [tags.use()],
	fields: (f) => ({ title: f.string() }),
}).with({
	hooks: {
		beforeCreate: ({ data }) => {
			if (data.title === 'hooked') Object.assign(data, { tags: new Set(['']) })
		},
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		body: f.string(),
		labels: tagSet({ default: ['draft'] }),
	}),
})

const started = () =>
	defineApp({
		database: memory(),
		plugins: [tags.plugin()],
		models: [Post, Note],
	})

describe('a field type definition', () => {
	it('stores through a kernel field taking list or optional only', () => {
		expect(() =>
			defineFieldType({
				plugin: 'bad',
				stored: (f) => f.string({ unique: true }),
				decode: (stored) => stored,
				encode: (value) => value,
				schema: z.string(),
				toJSON: (value) => value,
			}),
		).toThrow(
			'defineFieldType(bad): the stored field takes list or optional only, not unique.',
		)
	})

	it('refuses what is not a field type', () => {
		const valid = {
			plugin: 'bad',
			stored: (f: FieldBuilders<never>) => f.string(),
			decode: (stored: string) => stored,
			encode: (value: string) => value,
			schema: z.string(),
			toJSON: (value: string) => value,
		}
		// Spread over the valid one, `changed` keeps its type.
		const refused = (changed: object) => () =>
			defineFieldType({ ...valid, ...changed })
		expect(refused({ plugin: '' })).toThrow(
			'defineFieldType takes the name of its plugin.',
		)
		expect(refused({ stored: 'string' })).toThrow(
			'defineFieldType(bad): stored is a function.',
		)
		expect(refused({ stored: () => ({}) })).toThrow(
			'defineFieldType(bad): stored returns a kernel scalar field, without .with.',
		)
		expect(refused({ schema: {} })).toThrow(
			'defineFieldType(bad): schema is a Standard Schema.',
		)
		expect(refused({ decode: 1 })).toThrow(
			'defineFieldType(bad): decode is a function.',
		)
	})

	it('refuses addedIndexes that are not a list of indexes', () => {
		expect(() =>
			definePlugin<Tags>({
				name: 'tags',
				manifest,
				// @ts-expect-error: an index lists its fields.
				addedIndexes: [{ fields: 'tags' }],
			}),
		).toThrow('tags.addedIndexes is a list of { fields, unique? }.')
	})

	it('gives a builder taking default only', () => {
		// @ts-expect-error: the stored field says whether it is optional.
		expect(() => tagSet({ optional: true })).toThrow(
			'A tags field takes default only, not optional: its stored field says the rest.',
		)
	})

	it('is refused at startup when its plugin is not in plugins (D-32)', async () => {
		// @ts-expect-error: Note's labels are a tags field.
		const app = defineApp({ database: memory(), models: [Note] })
		await expect(app.start()).rejects.toThrow(
			'Note.labels is a tags field, and tags is not in plugins.',
		)
	})

	it('adds its plugin indexes, checked with the model', () => {
		const options = {
			database: memory(),
			models: [Post],
			plugins: [tags.plugin()],
		}
		const post = schemaOf(options).models.find(({ name }) => name === 'Post')
		expect(post?.indexes).toMatchObject([{ fields: ['tags'] }])
	})
})

describe('a field type value', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		hidden = undefined
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('is validated, encoded, and decoded on each read', async () => {
		const post = await Post.create(
			{ data: { title: 'a', tags: ['b', 'a'] } },
			M,
		)
		expect(post.tags).toEqual(new Set(['a', 'b']))
		expectTypeOf(post.tags).toEqualTypeOf<Set<string>>()
		const read = await Post.findUnique({ where: { id: post.id } }, M)
		expect(read?.tags).toEqual(new Set(['a', 'b']))
		const updated = await Post.update(
			{ where: { id: post.id }, data: { tags: new Set(['c']) } },
			M,
		)
		expect(updated.tags).toEqual(new Set(['c']))
	})

	it('takes its default, validated by its schema', async () => {
		const note = await Note.create({ data: { body: 'x' } }, M)
		expect(note.labels).toEqual(new Set(['draft']))
	})

	it('refuses what its schema refuses', async () => {
		await expect(
			// @ts-expect-error: tags are strings.
			Post.create({ data: { title: 'a', tags: [1] } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('names the plugin when its encoded value does not fit', async () => {
		await expect(Post.create({ data: { title: 'hooked' } }, M)).rejects.toThrow(
			'the tags field type encoded a value its stored field refuses',
		)
	})

	it('is filtered by a beforeFind, in its stored form', async () => {
		await Post.create({ data: { title: 'kept', tags: ['a'] } }, M)
		await Post.create({ data: { title: 'hidden', tags: ['secret'] } }, M)
		hidden = 'secret'
		const titles = (await Post.findMany({}, M)).map(({ title }) => title)
		expect(titles).toEqual(['kept'])
	})

	it('is neither filtered nor sorted by a query', async () => {
		await expect(
			// @ts-expect-error: only a beforeFind filters a plugin field.
			Post.findMany({ where: { tags: { has: 'a' } } }, M),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'where.tags: Post.tags is a tags field, which only a beforeFind filters.',
		})
		await expect(
			// @ts-expect-error: a plugin field is not sorted.
			Note.findMany({ orderBy: { labels: 'asc' } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})
