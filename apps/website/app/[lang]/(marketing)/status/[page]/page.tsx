import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TranslationFallback } from '../../../../../components/docs/translation-fallback'
import {
	getStatusPage,
	isStatusPageSlug,
	statusPageSlugs,
} from '../../../../../components/status/content'
import { StatusPage } from '../../../../../components/status/status-page'
import { isSiteLocale, supportedLocales } from '../../../../../lib/i18n'
import { createPublicPageMetadata } from '../../../../../lib/metadata'

interface StatusRouteProps {
	readonly params: Promise<{
		readonly lang: string
		readonly page: string
	}>
}

export default async function StatusRoute({ params }: StatusRouteProps) {
	const { lang, page } = await params
	if (!isSiteLocale(lang) || !isStatusPageSlug(page)) notFound()

	const content = getStatusPage(page)
	if (lang === 'fr') {
		return (
			<div className="ub-status-fallback">
				<TranslationFallback
					englishUrl={`/status/${page}`}
					returnLabel="Accueil français"
					returnUrl="/fr"
				/>
			</div>
		)
	}

	return <StatusPage content={content} locale={lang} />
}

export function generateStaticParams() {
	return supportedLocales.flatMap((lang) =>
		statusPageSlugs.map((page) => ({ lang, page })),
	)
}

export async function generateMetadata({
	params,
}: StatusRouteProps): Promise<Metadata> {
	const { lang, page } = await params
	if (!isSiteLocale(lang) || !isStatusPageSlug(page)) notFound()

	const content = getStatusPage(page)
	const canonicalPath = `/status/${page}`
	if (lang === 'fr') {
		return createPublicPageMetadata({
			canonicalPath,
			description:
				'Cette page de statut est disponible en anglais pendant sa traduction.',
			locale: lang,
			title: 'Traduction française en attente',
		})
	}

	return createPublicPageMetadata({
		canonicalPath,
		description: content.description,
		languages: { en: canonicalPath },
		locale: lang,
		title: content.eyebrow,
	})
}
