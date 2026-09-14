import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { QueryBuilder } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'

import { Post } from './fixtures/querying/schemas'
import { ultimabase } from './fixtures/querying/ultimabase'

const generatedPath = fileURLToPath(
	new URL(
		'./fixtures/querying/.ultimabase/schema.generated.d.ts',
		import.meta.url,
	),
)
let generatedContents = ''

beforeAll(() => {
	generatedContents = generateApplicationTypes({
		application: ultimabase.application,
		applicationId: 'website-querying',
	}).contents
})

afterAll(async () => {
	await ultimabase.dispose()
})

describe('querying documentation contracts', () => {
	it('keeps query branches immutable and emits canonical object input', () => {
		const base = new QueryBuilder(Post).select({
			createdAt: true,
			title: true,
		})
		const page = base
			.where({ published: { eq: true } })
			.descending('createdAt')
			.ascending('id')
			.limit(10)
			.offset(20)

		expect(base.build()).toStrictEqual({
			select: { createdAt: true, id: true, title: true },
		})
		expect(page.build()).toStrictEqual({
			limit: 10,
			offset: 20,
			orderBy: { createdAt: 'desc', id: 'asc' },
			select: { createdAt: true, id: true, title: true },
			where: { published: { eq: true } },
		})
		expect(base.build()).not.toHaveProperty('where')
		expect(page).not.toBe(base)
		expect(Object.isFrozen(page)).toBe(true)
	})

	it('keeps pointer and relation inclusion capabilities distinct', () => {
		const query = new QueryBuilder(Post)
			.include('author', (author) => author.select({ name: true }))
			.include('comments', (comments) =>
				comments
					.where({ published: { eq: true } })
					.descending('createdAt')
					.limit(3)
					.select({ body: true }),
			)

		expect(query.build()).toStrictEqual({
			include: {
				author: { select: { id: true, name: true } },
				comments: {
					limit: 3,
					orderBy: { createdAt: 'desc' },
					select: { body: true, id: true },
					where: { published: { eq: true } },
				},
			},
		})
	})

	it('normalizes visible relation predicates and cardinality', () => {
		const query = new QueryBuilder(Post).where({
			comments: {
				count: {
					gte: 3,
					where: { published: { eq: true } },
				},
				some: { body: { contains: 'typed' } },
			},
		})

		expect(query.build()).toStrictEqual({
			where: {
				AND: [
					{
						comments: {
							count: {
								gte: 3,
								where: { published: { eq: true } },
							},
						},
					},
					{
						comments: {
							some: { body: { contains: 'typed' } },
						},
					},
				],
			},
		})
	})

	it('keeps the checked-in application declarations synchronized', async () => {
		const expected = await readFile(generatedPath, 'utf8')

		expect(generatedContents).toBe(expected)
	})
})
