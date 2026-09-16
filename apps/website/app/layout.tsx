import { RootProvider } from 'fumadocs-ui/provider/next'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { siteConfig } from '../lib/site'

import './globals.css'

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
}

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<RootProvider>{children}</RootProvider>
			</body>
		</html>
	)
}
