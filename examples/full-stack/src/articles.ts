import { anonymous } from '@ultimabase/core/plugin'

import type { createUltimabase } from './ultimabase.ts'
import { ExampleArticle } from './schema.ts'

/** One application built by `createUltimabase`. */
type FullStackApplication = ReturnType<typeof createUltimabase>

// The example typecheck compiles these regions.

/** Reads the computed fields of one article: none of them is stored. */
export const readArticlePresentation = async (slug: string) => {
	const article = await ExampleArticle.findOne({
		select: {
			displayTitle: true,
			labels: true,
			optionalSubtitle: true,
			summary: true,
			viewerLabel: true,
		},
		where: { slug: { eq: slug } },
	})
	return article
}

/** Writes an article, its author link and its contributors atomically. */
export const writeArticleGraph = async (
	existingAuthorId: string,
	existingContributorId: string,
) => {
	const article = await ExampleArticle.createOne({
		data: {
			author: { connect: existingAuthorId },
			contributors: {
				create: [{ name: 'Grace' }],
				connect: [existingContributorId],
			},
			slug: 'nested-writes',
			title: 'Nested writes',
		},
		include: {
			author: { select: { name: true } },
			contributors: { select: { id: true, name: true } },
		},
	})

	const createdContributor = article.contributors.find(
		(contributor) => contributor.name === 'Grace',
	)
	if (createdContributor === undefined) throw new Error('Missing contributor')

	const updated = await ExampleArticle.updateOne({
		where: { id: article.id },
		data: {
			contributors: {
				update: [
					{
						id: createdContributor.id,
						data: { name: 'Grace Hopper' },
					},
				],
				disconnect: [existingContributorId],
			},
		},
		include: {
			author: { select: { name: true } },
			contributors: { select: { id: true, name: true } },
		},
	})
	return updated
}

/** Runs one GraphQL document in process, without Yoga or HTTP. */
export const listArticlesInProcess = async (
	ultimabase: FullStackApplication,
) => {
	const graphql = ultimabase.plugin('@ultimabase/graphql-plugin')
	const context = anonymous(ultimabase, {
		requestId: crypto.randomUUID(),
		source: 'internal',
	}).context

	const result = await graphql.execute({
		context,
		document: `{
			findManyExampleArticle(first: 10) {
				nodes { id slug title }
				pageInfo { hasNextPage endCursor }
			}
		}`,
	})
	return result
}
