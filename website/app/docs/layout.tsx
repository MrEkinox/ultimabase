import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'

import { shared } from '../../lib/layout'
import { pageTree } from '../../lib/source'

export default function Layout({ children }: { readonly children: ReactNode }) {
	return (
		<DocsLayout {...shared} tree={pageTree()}>
			{children}
		</DocsLayout>
	)
}
