import { RootProvider } from 'fumadocs-ui/provider/next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Search } from '../components/search'
// oxlint-disable-next-line import/no-unassigned-import -- Next bundles the stylesheet a layout imports.
import './global.css'

export const metadata: Metadata = {
	title: { default: 'UltimaBase', template: '%s · UltimaBase' },
	description:
		'Declare your models and who may read and write them; UltimaBase serves them over GraphQL and REST, on PostgreSQL or in memory.',
}

export default function Layout({ children }: { readonly children: ReactNode }) {
	return (
		<html
			className={`${GeistSans.variable} ${GeistMono.variable}`}
			lang="en"
			suppressHydrationWarning
		>
			<body className="flex min-h-screen flex-col">
				<RootProvider search={{ SearchDialog: Search }}>
					{children}
				</RootProvider>
			</body>
		</html>
	)
}
