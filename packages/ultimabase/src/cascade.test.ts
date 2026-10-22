// Cascades at run time (D-54, D-90): what deleting a row does to the rows
// that reference it, their hooks and their order.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Field, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import type { Queries } from './query.ts'

const M = { as: master }
const log: string[] = []
const facts = new Map<string, unknown>()
let locked: string | undefined

/** Logs a hook's run on a row, and fails on the locked one. */
const step = (model: string, hook: string, name: unknown): void => {
	const line = `${model} ${hook} ${String(name)}`
	log.push(line)
	if (locked === line) throw new Error(`${line} failed.`)
}

interface TrashCommands<F> {
	readonly trash: Queries<F>
}
interface Trash extends PluginTypes {
	readonly name: 'trash'
	readonly addedFields: {
		readonly trashedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: TrashCommands<this['fields']>
}
const trash = definePlugin<Trash>({
	name: 'trash',
	manifest: {
		name: 'trash',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	addedFields: (f) => ({ trashedAt: f.date({ optional: true }) }),
	redirect: {
		delete: async ({ where, queries }) => {
			log.push('redirect')
			return queries.update({ where, data: { trashedAt: new Date() } }, M)
		},
	},
	hooks: {
		beforeFind: ({ where, command }) =>
			command === 'trash'
				? where({ trashedAt: { not: null } })
				: where({ trashedAt: null }),
	},
	commands: ({ queries }) => ({ trash: queries }),
})

const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post),
		edited: f.many(() => Post),
		comments: f.many(() => Comment),
		invoices: f.many(() => Invoice),
		badges: f.many(() => Badge),
		notes: f.many(() => Note),
	}),
}).with({
	access: { read: () => true, delete: () => true },
	hooks: {
		beforeDelete: ({ record }) => {
			step('User', 'beforeDelete', record.name)
		},
		afterDelete: ({ record }) => {
			step('User', 'afterDelete', record.name)
		},
		afterDeleteCommit: ({ record }) => {
			step('User', 'afterDeleteCommit', record.name)
		},
	},
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		orphaned: f.boolean({ default: false }),
		author: f.one(() => User, { onDelete: 'cascade', inverse: 'posts' }),
		editor: f.one(() => User, { optional: true, inverse: 'edited' }),
		comments: f.many(() => Comment),
		tags: f.many(() => Tag),
	}),
}).with({
	// The cascade checks the delete rule of the row deleted only (D-54).
	access: { read: () => true, delete: () => false },
	hooks: {
		beforeUpdate: ({ record, data }) => {
			step('Post', 'beforeUpdate', record.title)
			facts.set('Post.beforeUpdate', { ...data })
			// A hook adds a field to an emptied key (D-88, D-90).
			Object.assign(data, { orphaned: true })
		},
		afterUpdate: ({ record, previous }) => {
			step('Post', 'afterUpdate', record.title)
			facts.set('Post.afterUpdate', { record, previous })
		},
		beforeDelete: ({ record }) => {
			step('Post', 'beforeDelete', record.title)
		},
		afterDelete: ({ record }) => {
			step('Post', 'afterDelete', record.title)
		},
	},
})

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		body: f.string(),
		post: f.one(() => Post, { onDelete: 'cascade' }),
		writer: f.one(() => User, { optional: true, onDelete: 'restrict' }),
	}),
}).with({
	hooks: {
		beforeDelete: ({ record }) => {
			step('Comment', 'beforeDelete', record.body)
		},
		afterDelete: ({ record }) => {
			step('Comment', 'afterDelete', record.body)
			facts.set('Comment.afterDelete', record)
		},
	},
})

// A required relation restricts by default, whatever `beforeFind` hides.
const Invoice = defineModel({
	name: 'Invoice',
	fields: (f) => ({
		hidden: f.boolean({ default: false }),
		user: f.one(() => User),
	}),
}).with({
	hooks: {
		beforeFind: ({ where }) => where({ hidden: false }),
		beforeDelete: () => {
			step('Invoice', 'beforeDelete', '')
		},
	},
})

// An optional relation sets null by default; no hooks.
const Badge = defineModel({
	name: 'Badge',
	fields: (f) => ({
		label: f.string(),
		owner: f.one(() => User, { optional: true }),
	}),
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
})

const Note = defineModel({
	name: 'Note',
	use: [trash.use()],
	fields: (f) => ({
		text: f.string(),
		author: f.one(() => User, { onDelete: 'cascade' }),
		replies: f.many(() => Reply),
	}),
}).with({
	hooks: {
		beforeDelete: ({ record }) => {
			step('Note', 'beforeDelete', record.text)
		},
		afterDelete: ({ record }) => {
			step('Note', 'afterDelete', record.text)
		},
	},
})

const Reply = defineModel({
	name: 'Reply',
	fields: (f) => ({
		text: f.string(),
		note: f.one(() => Note, { onDelete: 'cascade' }),
	}),
})

// A self relation, which may form a cycle.
const Category = defineModel({
	name: 'Category',
	fields: (f) => ({
		name: f.string(),
		parent: f.one(() => Category, {
			optional: true,
			onDelete: 'cascade',
			inverse: 'children',
		}),
		children: f.many(() => Category),
	}),
}).with({
	hooks: {
		beforeDelete: ({ record }) => {
			step('Category', 'beforeDelete', record.name)
		},
	},
})

const started = () =>
	defineApp({
		database: memory(),
		plugins: [trash.plugin()],
		models: [User, Post, Comment, Invoice, Badge, Tag, Note, Reply, Category],
	})
let app: ReturnType<typeof started>

const user = (id: string) => ({ as: asUser({ id }) })

const people = async (name: string) =>
	(await User.create({ data: { name } }, M)).id
const by = (id: string) => ({ connect: { id } })
const post = async (title: string, author: string, editor?: string) =>
	(
		await Post.create(
			{
				data: {
					title,
					author: by(author),
					...(editor === undefined ? {} : { editor: by(editor) }),
				},
			},
			M,
		)
	).id
const comment = async (body: string, on: string, writer?: string) =>
	(
		await Comment.create(
			{
				data: {
					body,
					post: by(on),
					...(writer === undefined ? {} : { writer: by(writer) }),
				},
			},
			M,
		)
	).id

let ada: string
let bob: string

beforeEach(async () => {
	app = started()
	await app.start()
	ada = await people('ada')
	bob = await people('bob')
	log.length = 0
	facts.clear()
	locked = undefined
})
afterEach(async () => {
	await app.stop()
})

describe('a cascade', () => {
	it('deletes the rows that reference the row, the deepest first', async () => {
		const own = await post('own', ada, ada)
		await comment('first', own)
		const kept = await post('kept', bob, ada)
		log.length = 0
		await User.delete({ where: { id: ada } }, M)
		expect(log).toStrictEqual([
			// `own` is deleted, so its `editor` is not emptied.
			'Post beforeUpdate kept',
			'Comment beforeDelete first',
			'Post beforeDelete own',
			'User beforeDelete ada',
			'Post afterUpdate kept',
			'Comment afterDelete first',
			'Post afterDelete own',
			'User afterDelete ada',
			'User afterDeleteCommit ada',
		])
		const posts = await Post.findMany({}, M)
		expect(posts.map((row) => row.id)).toStrictEqual([kept])
		expect(await Comment.findMany({}, M)).toStrictEqual([])
		expect(await User.findMany({}, M)).toMatchObject([{ name: 'bob' }])
	})

	it('gives each hook the record as it was', async () => {
		const own = await post('own', ada)
		const first = await comment('first', own)
		await User.delete({ where: { id: ada } }, M)
		expect(facts.get('Comment.afterDelete')).toMatchObject({
			id: first,
			body: 'first',
			post: { id: own },
		})
	})

	it('checks the access rule of the row the caller deletes only', async () => {
		await post('own', ada)
		await User.delete({ where: { id: ada } }, user(ada))
		expect(await Post.findMany({}, M)).toStrictEqual([])
	})

	it('rolls back when a hook of a cascaded row fails', async () => {
		const own = await post('own', ada)
		await comment('locked', own)
		locked = 'Comment beforeDelete locked'
		await expect(User.delete({ where: { id: ada } }, M)).rejects.toThrow(
			'Comment beforeDelete locked failed.',
		)
		expect(await Post.findMany({}, M)).toHaveLength(1)
		expect(await Comment.findMany({}, M)).toHaveLength(1)
		expect(await User.findMany({}, M)).toHaveLength(2)
	})

	it('removes the row from its joins, without hooks', async () => {
		const own = await post('own', ada)
		const tag = await Tag.create(
			{ data: { name: 'news', posts: { connect: [{ id: own }] } } },
			M,
		)
		await User.delete({ where: { id: ada } }, M)
		expect(
			await Tag.findUnique(
				{ where: { id: tag.id }, include: { posts: true } },
				M,
			),
		).toMatchObject({ name: 'news', posts: [] })
	})

	it('handles a row reached twice once, through a cycle', async () => {
		const a = await Category.create({ data: { name: 'a' } }, M)
		const b = await Category.create(
			{ data: { name: 'b', parent: by(a.id) } },
			M,
		)
		await Category.update(
			{ where: { id: a.id }, data: { parent: by(b.id) } },
			M,
		)
		await Category.create({ data: { name: 'c', parent: by(b.id) } }, M)
		log.length = 0
		await Category.delete({ where: { id: a.id } }, M)
		expect(log).toStrictEqual([
			'Category beforeDelete c',
			'Category beforeDelete b',
			'Category beforeDelete a',
		])
		expect(await Category.findMany({}, M)).toStrictEqual([])
	})
})

describe('setNull', () => {
	it('runs the update hooks of the row whose key it empties', async () => {
		const kept = await post('kept', bob, ada)
		const before = await Post.findUnique({ where: { id: kept } }, M)
		// The next millisecond, so the emptied row's updatedAt differs.
		await new Promise((done) => setTimeout(done, 2))
		await User.delete({ where: { id: ada } }, M)
		expect(facts.get('Post.beforeUpdate')).toStrictEqual({
			editor: { disconnect: true },
		})
		const after = await Post.findUnique(
			{ where: { id: kept }, include: { editor: true } },
			M,
		)
		expect(after).toMatchObject({ editor: null, orphaned: true })
		expect(facts.get('Post.afterUpdate')).toMatchObject({
			record: { editor: null },
			previous: { editor: { id: ada } },
		})
		expect(after?.updatedAt.getTime()).toBeGreaterThan(
			before?.updatedAt.getTime() ?? Number.POSITIVE_INFINITY,
		)
	})

	it('empties the key of a model without hooks', async () => {
		const badge = await Badge.create(
			{ data: { label: 'gold', owner: by(ada) } },
			M,
		)
		// The next millisecond, so the emptied row's updatedAt differs.
		await new Promise((done) => setTimeout(done, 2))
		await User.delete({ where: { id: ada } }, M)
		const after = await Badge.findUnique(
			{ where: { id: badge.id }, include: { owner: true } },
			M,
		)
		expect(after).toMatchObject({ label: 'gold', owner: null })
		expect(after?.updatedAt.getTime()).toBeGreaterThan(
			badge.updatedAt.getTime(),
		)
	})
})

describe('restrict', () => {
	const restricted = {
		code: 'RELATION_RESTRICTED',
		message: 'Invoice.user references a User the delete removes (D-54).',
		details: { model: 'Invoice', field: 'user' },
	}

	it('refuses the delete before any hook, even of a hidden row', async () => {
		await Invoice.create({ data: { user: by(ada), hidden: true } }, M)
		await post('own', ada)
		log.length = 0
		await expect(User.delete({ where: { id: ada } }, M)).rejects.toMatchObject(
			restricted,
		)
		expect(log).toStrictEqual([])
		expect(await User.findMany({}, M)).toHaveLength(2)
		expect(await Post.findMany({}, M)).toHaveLength(1)
	})

	it('refuses a row deeper in the cascade', async () => {
		const own = await post('own', bob)
		await comment('first', own, ada)
		await expect(User.delete({ where: { id: ada } }, M)).rejects.toMatchObject({
			code: 'RELATION_RESTRICTED',
			details: { model: 'Comment', field: 'writer' },
		})
	})

	it('lets a row the cascade removes go', async () => {
		const own = await post('own', ada)
		await comment('mine', own, ada)
		await User.delete({ where: { id: ada } }, M)
		expect(await Comment.findMany({}, M)).toStrictEqual([])
	})
})

describe('a redirected row', () => {
	it('is redirected in a cascade, and cascades nothing', async () => {
		const note = await Note.create(
			{ data: { text: 'draft', author: by(ada) } },
			M,
		)
		await Reply.create({ data: { text: 'ok', note: by(note.id) } }, M)
		log.length = 0
		await User.delete({ where: { id: ada } }, M)
		expect(log).toStrictEqual([
			'Note beforeDelete draft',
			'User beforeDelete ada',
			'redirect',
			'Note afterDelete draft',
			'User afterDelete ada',
			'User afterDeleteCommit ada',
		])
		expect(await Note.trash.findMany({}, M)).toMatchObject([{ text: 'draft' }])
		expect(await Reply.findMany({}, M)).toMatchObject([{ text: 'ok' }])
	})

	it('cascades nothing when deleted directly', async () => {
		const note = await Note.create(
			{ data: { text: 'draft', author: by(ada) } },
			M,
		)
		await Reply.create({ data: { text: 'ok', note: by(note.id) } }, M)
		await Note.delete({ where: { id: note.id } }, M)
		expect(await Reply.findMany({}, M)).toMatchObject([{ text: 'ok' }])
	})
})
