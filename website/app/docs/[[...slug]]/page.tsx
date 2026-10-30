import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page'
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
	return (
		<DocsPage toc={page.data.toc}>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
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
