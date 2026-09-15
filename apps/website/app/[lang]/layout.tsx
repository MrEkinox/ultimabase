import { i18nProvider } from 'fumadocs-ui/i18n'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { SiteProvider } from '../../components/site-provider'
import { i18n, isSiteLocale, translations } from '../../lib/i18n'
import { siteConfig } from '../../lib/site'

import '../globals.css'

export const metadata: Metadata = {
	description: siteConfig.description,
	metadataBase: siteConfig.canonicalUrl,
	openGraph: {
		description: siteConfig.description,
		locale: 'en_US',
		siteName: siteConfig.name,
		title: siteConfig.name,
		type: 'website',
		url: siteConfig.canonicalUrl,
	},
	robots: {
		follow: siteConfig.preview.indexable,
		index: siteConfig.preview.indexable,
	},
	title: {
		default: siteConfig.name,
		template: `%s · ${siteConfig.name}`,
	},
	twitter: {
		card: 'summary',
		description: siteConfig.description,
		title: siteConfig.name,
	},
}

export const viewport: Viewport = {
	colorScheme: 'light dark',
}

interface RootLayoutProps {
	readonly children: ReactNode
	readonly params: Promise<{ readonly lang: string }>
}

export default async function RootLayout({
	children,
	params,
}: RootLayoutProps) {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()

	return (
		<html lang={lang} suppressHydrationWarning>
			<body>
				<SiteProvider i18n={i18nProvider(translations, lang)}>
					{children}
				</SiteProvider>
			</body>
		</html>
	)
}

export function generateStaticParams() {
	return i18n.languages.map((lang) => ({ lang }))
}
