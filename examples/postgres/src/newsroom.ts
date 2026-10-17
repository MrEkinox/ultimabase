import { Article, Contribution } from './schema.ts'
import { ultimabase } from './ultimabase.ts'

/**
 * Publishes an article and records its editor in one explicit transaction:
 * both writes commit together, or neither does.
 */
export const publishWithEditor = (articleId: string, editorId: string) =>
	ultimabase.transaction(async () => {
		const article = await Article.updateOne({
			where: { id: articleId },
			data: { status: 'published', publishedAt: new Date().toISOString() },
			select: { status: true },
		})
		if (article === null) throw new Error('Article not found')

		await Contribution.createOne({
			data: {
				article: { connect: article.id },
				member: { connect: editorId },
				role: 'editor',
			},
		})
		return article
	})

const PAGE_SIZE = 2

/**
 * Keyset pagination: each page starts strictly after the last row of the
 * previous one, with no `OFFSET`.
 */
export const readPublishedPage = async (after?: {
	readonly id: string
	readonly publishedAt: string | null
}) => {
	const rows = await Article.findMany({
		where: { status: 'published' },
		orderBy: { publishedAt: 'desc' },
		select: { id: true, publishedAt: true, title: true },
		take: PAGE_SIZE + 1,
		...(after === undefined ? {} : { after }),
	})
	return { hasMore: rows.length > PAGE_SIZE, rows: rows.slice(0, PAGE_SIZE) }
}
