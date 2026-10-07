import { notFound } from 'next/navigation'

import { siteConfig } from '../../../../lib/site'
import { documentationMarkdown, source } from '../../../../lib/source'

interface MarkdownRouteProps {
	readonly params: Promise<{
		readonly slug?: string[]
	}>
}

export const revalidate = false

/** Serve only generated documentation pages at their versioned Markdown URL. */
export async function GET(_request: Request, { params }: MarkdownRouteProps) {
	const { slug } = await params
	if (slug?.at(-1) !== 'content.md') notFound()

	const page = source.getPage(slug.slice(0, -1))
	if (page === undefined) notFound()

	return new Response(await documentationMarkdown.page(page), {
		// Keep the Markdown copy crawlable while consolidating search on the HTML page.
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			Link: `<${new URL(page.url, siteConfig.canonicalUrl).href}>; rel="canonical"`,
		},
	})
}

export function generateStaticParams() {
	return source.generateParams().map(({ slug }) => ({
		slug: [...slug, 'content.md'],
	}))
}
