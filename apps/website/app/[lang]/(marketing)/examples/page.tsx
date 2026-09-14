import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TranslationFallback } from '../../../../components/docs/translation-fallback'
import { ExamplesIndexPage } from '../../../../components/examples/examples-page'
import { isSiteLocale } from '../../../../lib/i18n'
import { createPublicPageMetadata } from '../../../../lib/metadata'

interface ExamplesPageProps {
	readonly params: Promise<{ readonly lang: string }>
}

export default async function ExamplesPage({ params }: ExamplesPageProps) {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()
	if (lang === 'fr') return <TranslationFallback englishUrl="/examples" />

	return <ExamplesIndexPage />
}

export async function generateMetadata({
	params,
}: ExamplesPageProps): Promise<Metadata> {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()

	const frenchFallback = lang === 'fr'
	return createPublicPageMetadata({
		canonicalPath: '/examples',
		description: frenchFallback
			? 'Les exemples exécutables sont disponibles en anglais pendant leur traduction.'
			: 'Run and understand the maintained UltimaBase minimal application through source-linked journeys.',
		locale: lang,
		title: frenchFallback
			? 'Traduction française en attente'
			: 'Runnable examples',
	})
}
