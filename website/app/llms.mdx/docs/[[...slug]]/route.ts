// Each page's Markdown, at `/llms.mdx/docs/<page>/content.md`; the build
// moves it to `/docs/<page>.md` (scripts/markdown.ts), where a static export
// cannot write a route beside a page.
import { notFound } from 'next/navigation'

import { markdown } from '../../../../lib/markdown'
import { pageAt, segmentsOf, source } from '../../../../lib/source'

export const revalidate = false

export async function GET(
	_request: Request,
	{ params }: { readonly params: Promise<{ readonly slug?: string[] }> },
): Promise<Response> {
	const { slug = [] } = await params
	const page =
		slug.at(-1) === 'content.md' ? pageAt(slug.slice(0, -1)) : undefined
	if (page === undefined) notFound()
	return new Response(await markdown.page(page), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	})
}

export function generateStaticParams(): { slug: string[] }[] {
	return source
		.getPages()
		.map((page) => ({ slug: [...segmentsOf(page), 'content.md'] }))
}
