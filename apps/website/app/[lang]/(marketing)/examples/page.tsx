import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TranslationFallback } from '../../../../components/docs/translation-fallback'
import { ExamplesIndexPage } from '../../../../components/examples/examples-page'
import { isSiteLocale } from '../../../../lib/i18n'

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

	return lang === 'fr'
		? {
				alternates: { canonical: '/examples' },
				description:
					'Les exemples exécutables sont disponibles en anglais pendant leur traduction.',
				title: 'Traduction française en attente',
			}
		: {
				alternates: { canonical: '/examples' },
				description:
					'Run and understand the maintained UltimaBase minimal application through source-linked journeys.',
				title: 'Runnable examples',
			}
}
