import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
	MarkdownCopyButton,
	ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { latest, pageAt, segmentsOf, source } from '../../../lib/source'

type Props = { readonly params: Promise<{ readonly slug?: string[] }> }

export default async function Page({ params }: Props) {
	const { slug = [] } = await params
	// Until a version is published, `/docs` is `/docs/next`.
	if (slug.length === 0 && latest === 'next') redirect('/docs/next')
	const page = pageAt(slug)
	if (page === undefined) notFound()
	const Content = page.data.body
	// The page's Markdown, which the build serves at its URL with `.md` (D-155).
	const markdownUrl = `${page.url}.md`
	return (
		<DocsPage toc={page.data.toc}>
			<DocsTitle>{page.data.title}</DocsTitle>
			{/* The page actions follow the description, not its 2rem margin. */}
			<DocsDescription className="mb-0">
				{page.data.description}
			</DocsDescription>
			<div className="flex flex-row items-center gap-2 border-b pb-6">
				<MarkdownCopyButton markdownUrl={markdownUrl} />
				<ViewOptionsPopover markdownUrl={markdownUrl} />
			</div>
			<DocsBody>
				<Content components={defaultMdxComponents} />
			</DocsBody>
		</DocsPage>
	)
}

export function generateStaticParams(): { slug: string[] }[] {
	const pages = source.getPages().map((page) => ({ slug: segmentsOf(page) }))
	return latest === 'next' ? [{ slug: [] }, ...pages] : pages
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug = [] } = await params
	const page = pageAt(slug)
	if (page === undefined) return {}
	return { title: page.data.title, description: page.data.description }
}
