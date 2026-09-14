import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ExamplesIndexPage } from '../../../../components/examples/examples-page'
import { isSiteLocale } from '../../../../lib/i18n'

export const metadata: Metadata = {
	description: 'Run and understand the maintained UltimaBase minimal application through source-linked journeys.',
	title: 'Runnable examples',
}

interface ExamplesPageProps {
	readonly params: Promise<{ readonly lang: string }>
}

export default async function ExamplesPage({ params }: ExamplesPageProps) {
	const { lang } = await params
	if (!isSiteLocale(lang) || lang !== 'en') notFound()

	return <ExamplesIndexPage />
}
