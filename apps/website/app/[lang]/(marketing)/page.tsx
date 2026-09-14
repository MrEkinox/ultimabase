import { notFound } from 'next/navigation'

import { LandingPage } from '../../../components/landing/landing-page'
import { isSiteLocale } from '../../../lib/i18n'

interface HomePageProps {
	readonly params: Promise<{ readonly lang: string }>
}

export default async function HomePage({ params }: HomePageProps) {
	const { lang } = await params
	if (!isSiteLocale(lang) || lang !== 'en') notFound()

	return <LandingPage />
}
