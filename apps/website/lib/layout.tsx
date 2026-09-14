import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

import { NavigationBrand } from '../components/brand'
import {
	i18nConfig,
	localizeNavigationLabel,
	localizePath,
	type SiteLocale,
} from './i18n'
import { siteConfig } from './site'

export const baseLayoutOptions = (locale: SiteLocale): BaseLayoutProps => ({
	i18n: i18nConfig,
	links: siteConfig.navigation.map((item) => ({
		...(item.external === true ? { external: true } : {}),
		text: localizeNavigationLabel(locale, item.label),
		url: item.external === true ? item.href : localizePath(locale, item.href),
	})),
	nav: {
		title: siteConfig.name,
		url: localizePath(locale, '/'),
	},
	searchToggle: { enabled: true },
	slots: { navTitle: NavigationBrand },
})
