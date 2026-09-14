import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { ReactNode } from 'react'

import { baseLayoutOptions } from '../../../lib/layout'
import { isSiteLocale } from '../../../lib/i18n'
import { notFound } from 'next/navigation'

interface MarketingLayoutProps {
	readonly children: ReactNode
	readonly params: Promise<{ readonly lang: string }>
}

export default async function MarketingLayout({
	children,
	params,
}: MarketingLayoutProps) {
	const { lang } = await params
	if (!isSiteLocale(lang)) notFound()

	return <HomeLayout {...baseLayoutOptions(lang)}>{children}</HomeLayout>
}
