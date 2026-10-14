import { anonymous } from '@ultimabase/core/plugin'

import type { createMinimalApplication } from './create-application.ts'
import { ExampleArticle } from './schema.ts'

type MinimalApplication = ReturnType<typeof createMinimalApplication>

// The README shows these regions; the example typecheck compiles them.

/** Reads the computed fields of one article: none of them is stored. */
export const readArticlePresentation = async (slug: string) => {
	//#region virtual-fields
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
	//#endregion virtual-fields
	return article
}

/** Writes an article, its author link and its contributors atomically. */
export const writeArticleGraph = async (
	existingAuthorId: string,
	existingContributorId: string,
) => {
	//#region nested-writes
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
	//#endregion nested-writes
	return updated
}

/** Runs one GraphQL document in process, without Yoga or HTTP. */
export const listArticlesInProcess = async (ultimabase: MinimalApplication) => {
	//#region graphql-execute
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
	//#endregion graphql-execute
	return result
}
