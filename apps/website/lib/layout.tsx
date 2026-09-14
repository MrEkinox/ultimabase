import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

import { NavigationBrand } from '../components/brand'
import { siteConfig } from './site'

export const baseLayoutOptions = (): BaseLayoutProps => ({
	links: siteConfig.navigation.map((item) => ({
		...(item.external === true ? { external: true } : {}),
		text: item.label,
		url: item.href,
	})),
	nav: {
		title: siteConfig.name,
		url: '/',
	},
	searchToggle: { enabled: false },
	slots: { navTitle: NavigationBrand },
})
