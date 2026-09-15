import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { SiteFooter } from '../../../components/site-shell'
import { baseLayoutOptions } from '../../../lib/layout'
import { isSiteLocale } from '../../../lib/i18n'

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

	return (
		<div className="ub-page-shell">
			<HomeLayout {...baseLayoutOptions(lang)}>{children}</HomeLayout>
			<SiteFooter locale={lang} />
		</div>
	)
}
