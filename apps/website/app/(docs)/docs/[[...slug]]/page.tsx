import { notFound } from 'next/navigation'
import { findNeighbour } from 'fumadocs-core/page-tree'
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page'
import {
	MarkdownCopyButton,
	ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page'
import { createRelativeLink } from 'fumadocs-ui/mdx'

import { getMdxComponents } from '../../../../components/mdx'
import {
	documentationEditOptions,
	documentationEditUrl,
} from '../../../../lib/docs-links'
import { createPublicPageMetadata } from '../../../../lib/metadata'
import { source } from '../../../../lib/source'

interface DocumentationPageProps {
	readonly params: Promise<{
		readonly slug?: string[]
	}>
}

export default async function DocumentationPage({
	params,
}: DocumentationPageProps) {
	const { slug } = await params
	const page = source.getPage(slug)
	if (page === undefined) notFound()
	const Content = page.data.body
	const neighbours = findNeighbour(source.getPageTree(), page.url)
	const markdownUrl = `${page.url}.md`

	return (
		<DocsPage
			editOnGithub={documentationEditOptions(page.path)}
			footer={{ items: neighbours }}
			lastUpdate={page.data.reviewedAt}
			toc={page.data.toc}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription className="mb-2">
				{page.data.description}
			</DocsDescription>
			<div className="flex flex-wrap items-center gap-2 border-b pt-2 pb-6">
				<MarkdownCopyButton markdownUrl={markdownUrl} />
				<ViewOptionsPopover
					githubUrl={documentationEditUrl(page.path).href}
					markdownUrl={markdownUrl}
				/>
			</div>
			<DocsBody>
				<Content
					components={getMdxComponents({
						a: createRelativeLink(source, page),
					})}
				/>
			</DocsBody>
		</DocsPage>
	)
}

export function generateStaticParams() {
	return source.generateParams()
}

export async function generateMetadata({ params }: DocumentationPageProps) {
	const { slug } = await params
	const page = source.getPage(slug)
	if (page === undefined) notFound()

	return createPublicPageMetadata({
		canonicalPath: page.url,
		description: page.data.description,
		title: page.data.title,
	})
}
