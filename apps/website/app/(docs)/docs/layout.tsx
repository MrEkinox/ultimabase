import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'

import { docsLayoutOptions } from '../../../lib/layout'
import { source } from '../../../lib/source'

interface DocumentationLayoutProps {
	readonly children: ReactNode
}

export default function DocumentationLayout({
	children,
}: DocumentationLayoutProps) {
	return (
		<DocsLayout {...docsLayoutOptions()} tree={source.getPageTree()}>
			{children}
		</DocsLayout>
	)
}
