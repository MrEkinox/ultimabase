import { Pointer } from '@ultimabase/core'

import { expect, it } from 'vitest'

import { Article, Tag, Author, Post } from './relation-postgres-fixture.js'

/** Registers the relation-filter cases in the owning E2E file and worker. */
export const registerRelationFilterTests = (): void => {
	it('filters owning, inverse, pointer, empty, and nested relations with target Access', async () => {
		const [alpha, beta, gamma, hidden] = await Tag.createMany({
			data: [
				{ label: 'predicate-alpha' },
				{ label: 'predicate-beta' },
				{ label: 'predicate-gamma' },
				{ label: 'predicate-hidden' },
			],
		})

		if (
			alpha === undefined ||
			beta === undefined ||
			gamma === undefined ||
			hidden === undefined
		) {
			throw new TypeError('Relation predicate tags are incomplete')
		}

		const [mixed, gammaOnly, empty] = await Article.createMany({
			data: [
				{ title: 'Predicate mixed' },
				{ title: 'Predicate gamma' },
				{ title: 'Predicate empty' },
			],
		})

		if (mixed === undefined || gammaOnly === undefined || empty === undefined) {
			throw new TypeError('Relation predicate articles are incomplete')
		}
		await mixed.relation('tags').connect([alpha.id, beta.id, hidden.id])
		await gammaOnly.relation('tags').connect(gamma.id)
		await Tag.updateOne({
			where: { id: { eq: hidden.id } },
			data: { visible: false },
		})

		expect(
			await Article.findMany({
				where: { tags: { some: { label: { eq: 'predicate-alpha' } } } },
			}),
		).toMatchObject([{ id: mixed.id }])
		expect(
			await Article.count({
				where: { tags: { some: { label: { eq: 'predicate-hidden' } } } },
			}),
		).toBe(0)
		expect(
			await Article.exists({
				where: {
					id: { eq: mixed.id },
					tags: { count: { eq: 2 } },
				},
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: {
					id: { eq: mixed.id },
					tags: { count: { gte: 3 } },
				},
			}),
		).toBe(false)
		expect(
			await Article.exists({
				where: {
					id: { eq: mixed.id },
					tags: {
						count: {
							where: { label: { startsWith: 'predicate-' } },
							gte: 2,
							lte: 2,
						},
					},
				},
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: {
					id: { eq: mixed.id },
					tags: {
						count: {
							where: {
								articles: {
									some: { title: { eq: 'Predicate mixed' } },
								},
							},
							eq: 2,
						},
					},
				},
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: {
					id: { eq: gammaOnly.id },
					tags: { count: { between: { lower: 1, upper: 1 } } },
				},
			}),
		).toBe(true)
		expect(
			await Article.count({
				where: { tags: { none: { label: { eq: 'predicate-gamma' } } } },
			}),
		).toBeGreaterThanOrEqual(2)
		expect(
			await Article.exists({
				where: {
					id: { eq: mixed.id },
					tags: { every: { label: { ne: 'predicate-gamma' } } },
				},
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: { id: { eq: empty.id }, tags: { some: {} } },
			}),
		).toBe(false)
		expect(
			await Article.exists({
				where: { id: { eq: empty.id }, tags: { none: {} } },
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: { id: { eq: empty.id }, tags: { every: {} } },
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: { id: { eq: empty.id }, tags: { isEmpty: true } },
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: { id: { eq: mixed.id }, tags: { isNotEmpty: true } },
			}),
		).toBe(true)
		expect(
			await Tag.exists({
				where: {
					id: { eq: alpha.id },
					articles: { some: { title: { eq: 'Predicate mixed' } } },
				},
			}),
		).toBe(true)
		expect(
			await Tag.exists({
				where: {
					id: { eq: alpha.id },
					articles: { count: { eq: 1 } },
				},
			}),
		).toBe(true)
		expect(
			await Article.exists({
				where: {
					id: { eq: mixed.id },
					tags: {
						some: {
							articles: { some: { title: { eq: 'Predicate mixed' } } },
						},
					},
				},
			}),
		).toBe(true)
		const author = await Author.createOne({
			data: { name: 'Predicate author' },
		})
		const post = await Post.createOne({
			data: {
				author: { connect: author.id },
				title: 'Predicate post',
			},
		})
		const hiddenPost = await Post.createOne({
			data: {
				author: {
					create: { name: 'Hidden predicate author', visible: false },
				},
				title: 'Hidden predicate post',
			},
		})
		expect(hiddenPost.author).toBeInstanceOf(Pointer)
		const hiddenAuthorId = (hiddenPost.author as Pointer).id
		const unassignedPost = await Post.createOne({
			data: { title: 'Unassigned predicate post' },
		})

		expect(
			await Post.exists({
				where: { id: { eq: post.id }, author: { eq: author.id } },
			}),
		).toBe(true)
		expect(
			await Post.exists({
				where: {
					id: { eq: post.id },
					author: { is: { name: { eq: 'Predicate author' } } },
				},
			}),
		).toBe(true)
		expect(
			await Post.exists({
				where: {
					id: { eq: post.id },
					author: { isNot: { name: { eq: 'Predicate author' } } },
				},
			}),
		).toBe(false)
		expect(
			await Post.exists({
				where: {
					id: { eq: hiddenPost.id },
					author: { eq: hiddenAuthorId },
				},
			}),
		).toBe(true)
		expect(
			await Post.exists({
				where: {
					id: { eq: hiddenPost.id },
					author: { is: { name: { eq: 'Hidden predicate author' } } },
				},
			}),
		).toBe(false)
		expect(
			await Post.exists({
				where: {
					id: { eq: hiddenPost.id },
					author: {
						isNot: { name: { eq: 'Hidden predicate author' } },
					},
				},
			}),
		).toBe(true)
		expect(
			await Post.exists({
				where: {
					id: { eq: unassignedPost.id },
					author: { isNot: { name: { eq: 'Predicate author' } } },
				},
			}),
		).toBe(true)
		expect(
			await Post.exists({
				where: {
					id: { eq: unassignedPost.id },
					author: {
						isNot: { name: { eq: 'Predicate author' } },
						isNotNull: true,
					},
				},
			}),
		).toBe(false)

		expect(
			await Author.exists({
				where: {
					id: { eq: author.id },
					posts: { some: { title: { eq: 'Predicate post' } } },
				},
			}),
		).toBe(true)
		expect(
			await Author.exists({
				where: {
					id: { eq: author.id },
					posts: { count: { eq: 1 } },
				},
			}),
		).toBe(true)
	})
}
