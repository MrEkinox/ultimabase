import type { TestApplication } from '@ultimabase/testing'
import { expect } from 'vitest'

import { Author, Post } from '../src/schema.ts'

/** Matches any string: generated ids, request ids and cursors. */
export const anyString: unknown = expect.any(String)

/** The posts every test starts from, written with Master authority. */
export const seedBlog = async () => {
	const ada = await Author.createOne({ data: { name: 'Ada' } })
	await Post.createMany({
		data: [
			{ title: 'Alpha', views: 30, status: 'published' },
			{ title: 'Beta', views: 5 },
			{ title: 'Gamma', views: 12, status: 'published' },
		],
	})
	const hello = await Post.createOne({
		data: {
			title: 'Hello',
			body: 'GraphQL selections choose the fields of the answer.',
			views: 42,
			status: 'published',
			author: { connect: ada.id },
			comments: { create: [{ body: 'First' }, { body: 'Second' }] },
			reviewNote: 'Check the dates',
		},
	})
	return { ada, hello }
}

const field = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null
		? Reflect.get(value, key)
		: undefined

/** A string member of a JSON answer, checked like untrusted input. */
export const stringAt = async (
	response: Response,
	...path: readonly string[]
): Promise<string> => {
	const value = path.reduce<unknown>(field, await response.json())
	if (typeof value !== 'string') {
		throw new TypeError(`No string at ${path.join('.')}`)
	}
	return value
}

/** POSTs one GraphQL document to `/graphql`, as the regions show in full. */
export const postQuery = (
	t: TestApplication,
	query: string,
	variables?: Readonly<Record<string, unknown>>,
) =>
	t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	})
