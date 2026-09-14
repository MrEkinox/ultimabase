import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LandingPage } from '../../../components/landing/landing-page'
import { isSiteLocale, localizePath } from '../../../lib/i18n'
import { createPublicPageMetadata } from '../../../lib/metadata'
import { siteConfig } from '../../../lib/site'

interface HomePageProps {
	readonly params: Promise<{ readonly lang: string }>
}

export default async function HomePage({ params }: HomePageProps) {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()

	return <LandingPage locale={lang} />
}

export async function generateMetadata({
	params,
}: HomePageProps): Promise<Metadata> {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()

	const description =
		lang === 'fr'
			? 'Un framework backend TypeScript typé, composé de plugins explicites et d’un Runtime unique.'
			: siteConfig.description

	return createPublicPageMetadata({
		absoluteTitle: true,
		canonicalPath: localizePath(lang, '/'),
		description,
		languages: { en: '/', fr: '/fr' },
		locale: lang,
		title: siteConfig.name,
	})
}
