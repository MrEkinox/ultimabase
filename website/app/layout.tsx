import { RootProvider } from 'fumadocs-ui/provider/next'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Search } from '../components/search'
// oxlint-disable-next-line import/no-unassigned-import -- Next bundles the stylesheet a layout imports.
import './global.css'

export const metadata: Metadata = {
	title: { default: 'UltimaBase', template: '%s · UltimaBase' },
	description:
		'A TypeScript backend built from a small kernel and its plugins.',
}

export default function Layout({ children }: { readonly children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider search={{ SearchDialog: Search }}>
					{children}
				</RootProvider>
			</body>
		</html>
	)
}
