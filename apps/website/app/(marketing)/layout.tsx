import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { ReactNode } from 'react'

import { SiteFooter } from '../../components/site-shell'
import { baseLayoutOptions } from '../../lib/layout'

interface MarketingLayoutProps {
	readonly children: ReactNode
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
	return (
		<div className="ub-page-shell">
			<HomeLayout {...baseLayoutOptions()}>{children}</HomeLayout>
			<SiteFooter />
		</div>
	)
}
