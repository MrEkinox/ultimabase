import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { resolveLinkItems } from 'fumadocs-ui/layouts/shared'
import type { ReactNode } from 'react'

import { baseLayoutOptions } from '../../lib/layout'
import { siteConfig } from '../../lib/site'

interface MarketingLayoutProps {
	readonly children: ReactNode
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
	const options = baseLayoutOptions()
	const links = resolveLinkItems({
		...options,
		githubUrl: siteConfig.repositoryUrl.href,
	}).map((link) =>
		link.type === 'icon'
			? {
					...link,
					// Fumadocs labels the link; its decorative SVG needs no separate image role.
					icon: <span aria-hidden="true">{link.icon}</span>,
				}
			: link,
	)

	return (
		<div className="ub-page-shell">
			<HomeLayout {...options} links={links}>
				{children}
			</HomeLayout>
		</div>
	)
}
