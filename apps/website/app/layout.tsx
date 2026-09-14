import { RootProvider } from 'fumadocs-ui/provider/next'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { SiteFooter } from '../components/site-shell'
import { siteConfig } from '../lib/site'

import './globals.css'

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

export default function RootLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<RootProvider>
					<div className="ub-page-shell">
						{children}
						<SiteFooter />
					</div>
				</RootProvider>
			</body>
		</html>
	)
}
