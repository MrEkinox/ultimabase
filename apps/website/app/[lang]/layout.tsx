import { i18nProvider } from 'fumadocs-ui/i18n'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { SiteFooter } from '../../components/site-shell'
import { i18n, isSiteLocale, translations } from '../../lib/i18n'
import { siteConfig } from '../../lib/site'

import '../globals.css'

export const metadata: Metadata = {
	description: siteConfig.description,
	metadataBase: siteConfig.canonicalUrl,
	title: {
		default: siteConfig.name,
		template: `%s · ${siteConfig.name}`,
	},
}

export const viewport: Viewport = {
	colorScheme: 'light dark',
	themeColor: [
		{ color: '#f5f3ed', media: '(prefers-color-scheme: light)' },
		{ color: '#111513', media: '(prefers-color-scheme: dark)' },
	],
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
				<RootProvider i18n={i18nProvider(translations, lang)}>
					<div className="ub-page-shell">
						{children}
						<SiteFooter locale={lang} />
					</div>
				</RootProvider>
			</body>
		</html>
	)
}

export function generateStaticParams() {
	return i18n.languages.map((lang) => ({ lang }))
}
