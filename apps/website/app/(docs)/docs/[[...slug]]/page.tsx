import { notFound, redirect } from 'next/navigation'
import { findNeighbour } from 'fumadocs-core/page-tree'
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page'
import { createRelativeLink } from 'fumadocs-ui/mdx'

import { getMdxComponents } from '../../../../components/mdx'
import { documentationEditOptions } from '../../../../lib/docs-links'
import {
	documentationPath,
	documentationVersions,
	resolveLegacyDocumentationPath,
	versionDocumentationSlug,
} from '../../../../lib/docs-versions'
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
	const requestedVersion = documentationVersions.find(
		(version) => version.slug === slug?.[0],
	)
	const relativeSlug = requestedVersion === undefined ? slug : slug?.slice(1)
	const relativePath = relativeSlug?.join('/') ?? ''
	const canonicalPath = resolveLegacyDocumentationPath(relativePath)
	if (requestedVersion === undefined || canonicalPath !== relativePath) {
		redirect(documentationPath(canonicalPath, requestedVersion))
	}

	const page = source.getPage(slug)
	if (page === undefined) notFound()
	const Content = page.data.body
	const neighbours = findNeighbour(source.getPageTree(), page.url)

	return (
		<DocsPage
			editOnGithub={documentationEditOptions(page.path)}
			footer={{ items: neighbours }}
			lastUpdate={page.data.reviewedAt}
			toc={page.data.toc}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
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
	const versionedSlug = versionDocumentationSlug(slug)
	const page = source.getPage(versionedSlug)
	if (page === undefined) notFound()

	return createPublicPageMetadata({
		canonicalPath: page.url,
		description: page.data.description,
		title: page.data.title,
	})
}
