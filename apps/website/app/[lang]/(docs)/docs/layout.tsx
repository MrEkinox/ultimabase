import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { isSiteLocale } from '../../../../lib/i18n'
import { baseLayoutOptions } from '../../../../lib/layout'
import { source } from '../../../../lib/source'

interface DocumentationLayoutProps {
	readonly children: ReactNode
	readonly params: Promise<{ readonly lang: string }>
}

export default async function DocumentationLayout({
	children,
	params,
}: DocumentationLayoutProps) {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()

	return (
		<DocsLayout {...baseLayoutOptions(lang)} tree={source.getPageTree(lang)}>
			{children}
		</DocsLayout>
	)
}
