import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

import { NavigationBrand } from '../components/brand'
import { siteConfig } from './site'

const navigationLinks = () =>
	siteConfig.navigation.map((item) => ({
		...(item.external === true ? { external: true } : {}),
		text: item.label,
		url: item.href,
	}))

export const baseLayoutOptions = (): BaseLayoutProps => ({
	links: navigationLinks(),
	nav: {
		title: siteConfig.name,
		url: '/',
	},
	searchToggle: { enabled: true },
	slots: { navTitle: NavigationBrand },
})

export const docsLayoutOptions = (): BaseLayoutProps => ({
	...baseLayoutOptions(),
	links: navigationLinks().filter(
		(item) => item.url !== siteConfig.routes.docs,
	),
	slots: {},
})
