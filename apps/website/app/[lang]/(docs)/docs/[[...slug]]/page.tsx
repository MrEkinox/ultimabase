import { notFound } from 'next/navigation'
import { findNeighbour } from 'fumadocs-core/page-tree'
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page'
import { createRelativeLink } from 'fumadocs-ui/mdx'

import { TranslationFallback } from '../../../../../components/docs/translation-fallback'
import { getMdxComponents } from '../../../../../components/mdx'
import { resolveDocumentationPage } from '../../../../../lib/docs-localization'
import { documentationEditOptions } from '../../../../../lib/docs-links'
import { isSiteLocale } from '../../../../../lib/i18n'
import { createPublicPageMetadata } from '../../../../../lib/metadata'
import { source } from '../../../../../lib/source'

interface DocumentationPageProps {
	readonly params: Promise<{
		readonly lang: string
		readonly slug?: string[]
	}>
}

export default async function DocumentationPage({
	params,
}: DocumentationPageProps) {
	const { lang, slug } = await params
	if (!isSiteLocale(lang)) notFound()

	const resolution = resolveDocumentationPage(
		lang,
		source.getPage(slug, lang),
		source.getPage(slug, 'en'),
	)
	if (resolution.kind === 'translation-fallback') {
		return (
			<DocsPage toc={[]}>
				<DocsBody>
					<TranslationFallback englishUrl={resolution.englishPage.url} />
				</DocsBody>
			</DocsPage>
		)
	}
	if (resolution.kind === 'not-found') notFound()

	const { page } = resolution
	const Content = page.data.body
	const neighbours = findNeighbour(source.getPageTree(lang), page.url)

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
	const { lang, slug } = await params
	if (!isSiteLocale(lang)) notFound()

	const englishPage = source.getPage(slug, 'en')
	const resolution = resolveDocumentationPage(
		lang,
		source.getPage(slug, lang),
		englishPage,
	)
	if (resolution.kind === 'translation-fallback') {
		return createPublicPageMetadata({
			canonicalPath: resolution.englishPage.url,
			description:
				'Cette page est disponible en anglais pendant sa traduction.',
			locale: lang,
			title: 'Traduction française en attente',
		})
	}
	if (resolution.kind === 'not-found') notFound()

	const { page } = resolution
	const frenchPage = source.getPage(slug, 'fr')

	return createPublicPageMetadata({
		canonicalPath: page.url,
		description: page.data.description,
		languages: {
			...(englishPage === undefined ? {} : { en: englishPage.url }),
			...(frenchPage === undefined ? {} : { fr: frenchPage.url }),
		},
		locale: lang,
		title: page.data.title,
	})
}
