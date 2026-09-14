import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'

import { baseLayoutOptions } from '../../../lib/layout'
import { source } from '../../../lib/source'

export default function DocumentationLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<DocsLayout {...baseLayoutOptions()} tree={source.pageTree}>
			{children}
		</DocsLayout>
	)
}
