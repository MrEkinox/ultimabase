import { expect } from 'vitest'

import { Author, Post, Tag } from '../src/schema.ts'

/** Matches any string: generated ids, timestamps and cursors. */
export const anyString: unknown = expect.any(String)

/** The articles every test starts from, written with Master authority. */
export const seedBlog = async () => {
	const ada = await Author.createOne({ data: { name: 'Ada' } })
	const news = await Tag.createOne({ data: { name: 'news' } })
	const guides = await Tag.createOne({ data: { name: 'guides' } })
	await Post.createMany({
		data: [
			{ title: 'Alpha', slug: 'alpha', views: 30 },
			{ title: 'Beta', slug: 'beta', views: 5 },
			{ title: 'Gamma', slug: 'gamma', views: 12 },
			{ title: 'Delta', slug: 'delta', views: 0 },
		],
	})
	const hello = await Post.createOne({
		data: {
			title: 'Hello',
			slug: 'hello',
			views: 42,
			author: { connect: ada.id },
			tags: { connect: [news.id] },
			reviewNote: 'Check the dates',
		},
	})
	return { ada, guides, hello, news }
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
