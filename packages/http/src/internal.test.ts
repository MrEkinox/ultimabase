// The transport core REST and GraphQL share (D-139): pages, errors, names
// and JSON Schema reading.
import { describe, expect, it } from 'vitest'
import type { SchemaField } from 'ultimabase'
import { InvalidQuery, PublicError, Refused } from 'ultimabase'
import {
	backOf,
	badInput,
	connection,
	declared,
	jsonSchemaOf,
	oneOfsOf,
	pageArgs,
	pageOf,
	plural,
	readable,
	readableOneOfs,
	rowsOf,
	run,
} from './internal.ts'

const limits = { take: 2, maxTake: 5, model: { name: 'Post' } }
const rows = ['a', 'b', 'c'].map((id) => ({ id }))
const at = (name: string) => `include.posts.${name}`
const schema = (input: () => unknown) => ({
	'~standard': { jsonSchema: { input } },
})
const stops = (value: object, message: string) =>
	expect(() => jsonSchemaOf(value, 'input', 'f')).toThrow(new Refused(message))
const refused = (args: { readonly [key: string]: unknown }) => () =>
	pageOf('connection', limits, args, false, at)

describe('pageOf', () => {
	it('reads one row more than asked, after a cursor', () => {
		const first = pageOf('connection', limits, {}, false)
		expect(first).toStrictEqual({
			read: { take: 3 },
			relay: { size: 2, backward: false },
		})
		const page = connection(rows, { size: 2, backward: false }, (row) => row.id)
		const after = page.pageInfo.endCursor
		expect(page).toMatchObject({
			edges: [{ node: 'a' }, { node: 'b' }],
			pageInfo: { hasNextPage: true, hasPreviousPage: false },
		})
		expect(
			pageOf('connection', limits, { last: 1, before: after }, false).read,
		).toStrictEqual({ take: -2, cursor: { id: 'b' }, skip: 1 })
	})

	it('names where a refused argument was written', () => {
		expect(refused({ first: 1.5 })).toThrow(
			'include.posts.first must be an integer.',
		)
		expect(refused({ after: 3 })).toThrow(
			'include.posts.after must be a string.',
		)
		expect(refused({ after: 'nope' })).toThrow(
			'include.posts.after is not a cursor this API returned.',
		)
		expect(refused({ first: 6 })).toThrow(
			'include.posts.first is at most 5 on Post.',
		)
		expect(refused({ first: 1, last: 1 })).toThrow('not both')
	})

	it('reads take and skip for a list, any size for Master', () => {
		expect(pageArgs('list')).toStrictEqual(['take', 'skip'])
		expect(pageOf('list', limits, { take: 9, skip: null }, true)).toStrictEqual(
			{ read: { take: 9 }, relay: undefined },
		)
		expect(() => pageOf('list', limits, { take: -1 }, true)).toThrow(
			'take cannot be negative.',
		)
	})
})

describe('the shared helpers', () => {
	it('spells English plurals', () => {
		expect(
			['post', 'category', 'day', 'box', 'bus', 'match'].map(plural),
		).toStrictEqual([
			'posts',
			'categories',
			'days',
			'boxes',
			'buses',
			'matches',
		])
	})

	it('sends a refused query as the client error it is', async () => {
		const invalid = run(async () => {
			throw new InvalidQuery('where.x', 'Unknown key.')
		})
		await expect(invalid).rejects.toMatchObject({
			code: 'BAD_USER_INPUT',
			details: { path: 'where.x' },
		})
		const failure = new Error('down')
		await expect(run(async () => Promise.reject(failure))).rejects.toBe(failure)
		const cause = new SyntaxError('JSON')
		expect(badInput('Not JSON.', cause)).toStrictEqual(
			new PublicError('BAD_USER_INPUT', 'Not JSON.', { cause }),
		)
	})

	it('keeps the rows of a relation', () => {
		expect(rowsOf([{ id: 'a' }, null, { name: 'x' }])).toStrictEqual([
			{ id: 'a' },
		])
		expect(rowsOf(null)).toStrictEqual([])
	})

	it('reads a standard JSON Schema export, or stops startup', () => {
		expect(
			jsonSchemaOf(
				schema(() => ({ type: 'string' })),
				'input',
				'f',
			),
		).toStrictEqual({ type: 'string' })
		stops({}, 'f has no standard JSON Schema export.')
		stops(
			schema(() => 'odd'),
			"f's JSON Schema is not an object.",
		)
		stops(
			schema(() => {
				throw new Error('no export')
			}),
			'f: no export.',
		)
	})
})

const key = (
	name: string,
	target: string,
	of?: { field: string; kind: string; optional: boolean },
): SchemaField => ({
	kind: 'one',
	name,
	target,
	unique: false,
	optional: true,
	onDelete: 'restrict',
	stored: true,
	...(of === undefined ? {} : { of }),
})

/** A `comments` relation from a kind, back by `inverse`. */
const comments = (inverse?: string): SchemaField => ({
	...key('comments', 'Comment'),
	...(inverse === undefined ? {} : { inverse }),
})

describe('a oneOf', () => {
	const target = { field: 'target', optional: false }
	const about = { field: 'about', optional: true }
	const model = {
		name: 'Comment',
		indexes: [],
		fields: [
			key('author', 'User'),
			key('targetPost', 'Post', { ...target, kind: 'post' }),
			key('targetPhoto', 'Photo', { ...target, kind: 'photo' }),
			key('aboutPost', 'Post', { ...about, kind: 'post' }),
		],
	}

	it('gathers its kinds from their keys, read through it only', () => {
		const [author, targetPost] = model.fields
		const served = {
			model,
			exposed: { readRules: { about: 'private' as const }, virtuals: [] },
		}
		expect(oneOfsOf(model)).toStrictEqual([
			{
				name: 'target',
				optional: false,
				kinds: [
					{ kind: 'post', field: targetPost },
					{ kind: 'photo', field: model.fields[2] },
				],
			},
			{
				name: 'about',
				optional: true,
				kinds: [{ kind: 'post', field: model.fields[3] }],
			},
		])
		expect(readable(served)).toStrictEqual([author])
		expect(readableOneOfs(served).map(({ name }) => name)).toStrictEqual([
			'target',
		])
		expect(model.fields.map(declared)).toStrictEqual([
			'author',
			'target',
			'target',
			'about',
		])
	})

	it('names the way back to it by the oneOf a kind belongs to', () => {
		expect(backOf(comments('targetPhoto'), model)).toBe('target')
		expect(backOf(comments('author'), model)).toBe('author')
		expect(backOf(comments(), model)).toBeUndefined()
		const title: SchemaField = {
			kind: 'scalar',
			name: 'title',
			type: 'string',
			optional: false,
			list: false,
			unique: false,
		}
		expect(backOf(title, model)).toBeUndefined()
	})
})
