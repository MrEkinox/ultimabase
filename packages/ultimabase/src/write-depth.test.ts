// The deepest write (D-350): 32 levels, each row a relation write creates or
// updates one deeper; past it, a write is refused before the stack runs out,
// for every caller.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'
import { maxWriteDepth } from './internal.ts'

const M = { as: master }

const Node = defineModel({
	name: 'Node',
	fields: (f) => ({
		label: f.string(),
		parent: f.one(() => Node, { optional: true }),
		children: f.many(() => Node, { inverse: 'parent' }),
	}),
})
const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		on: f.oneOf({ comment: () => Comment, page: () => Page }),
		replies: f.many(() => Comment, { inverse: 'on' }),
	}),
})
const Page = defineModel({
	name: 'Page',
	fields: (f) => ({ comments: f.many(() => Comment, { inverse: 'on' }) }),
})

type NodeData = Parameters<typeof Node.create>[0]['data']
type CommentData = Parameters<typeof Comment.create>[0]['data']
type NodeUpdate = Parameters<typeof Node.update>[0]['data']

/** A row `levels` deep, each row creating the one above it. */
function parents(levels: number): NodeData {
	let data: NodeData = { label: 'top' }
	for (let level = 1; level < levels; level += 1) {
		data = { label: `${level}`, parent: { create: data } }
	}
	return data
}

/** A row `levels` deep, each row creating the one below it. */
function children(levels: number): NodeData {
	let data: NodeData = { label: 'leaf' }
	for (let level = 1; level < levels; level += 1) {
		data = { label: `${level}`, children: { create: [data] } }
	}
	return data
}

/** A page `levels` deep, each comment on the comment or page it creates. */
function thread(levels: number): CommentData {
	let data: CommentData = { on: { create: { page: {} } } }
	for (let level = 2; level < levels; level += 1) {
		data = { on: { create: { comment: data } } }
	}
	return data
}

const deeper = (steps: readonly string[]) => {
	const path = ['data', ...steps].join('.')
	return {
		path,
		message: `${path}: the write is nested more than 32 levels deep.`,
	}
}
const repeated = (step: string) => Array.from({ length: 32 }, () => step)

let app: ReturnType<typeof defineApp> | undefined
beforeAll(async () => {
	app = defineApp({ database: memory(), models: [Node, Comment, Page] })
	await app.start()
})
afterAll(async () => app?.stop())

describe('a write', () => {
	it('nests 32 levels', async () => {
		expect(maxWriteDepth).toBe(32)
		await Node.create({ data: parents(32) }, M)
		await Node.create({ data: children(32) }, M)
		await Comment.create({ data: thread(32) }, M)
		expect(await Node.count({}, M)).toBe(64)
		expect(await Comment.count({}, M)).toBe(31)
	})

	it('is refused one level deeper, at that level', async () => {
		await expect(Node.create({ data: parents(33) }, M)).rejects.toMatchObject(
			deeper(repeated('parent.create')),
		)
		await expect(Node.create({ data: children(33) }, M)).rejects.toMatchObject(
			deeper(repeated('children.create.0')),
		)
		await expect(Comment.create({ data: thread(33) }, M)).rejects.toMatchObject(
			deeper([...repeated('on.create.comment').slice(1), 'on.create.page']),
		)
	})

	it('counts an update and its nested updates as levels', async () => {
		const { id } = await Node.create({ data: { label: 'root' } }, M)
		let data: NodeUpdate = { label: 'deepest' }
		for (let level = 1; level < 33; level += 1) {
			data = { label: `${level}`, parent: { update: data } }
		}
		await expect(Node.update({ where: { id }, data }, M)).rejects.toMatchObject(
			deeper(repeated('parent.update')),
		)
	})

	it('is refused, not overflowing the stack, thousands of levels deep', async () => {
		await expect(
			Node.create({ data: parents(20_000) }, M),
		).rejects.toMatchObject(deeper(repeated('parent.create')))
	})
})
