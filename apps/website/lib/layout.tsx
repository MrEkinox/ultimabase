import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

import { NavigationBrand } from '../components/brand'
import {
	i18nConfig,
	localizeNavigationLabel,
	localizePath,
	type SiteLocale,
} from './i18n'
import { siteConfig } from './site'

const navigationLinks = (locale: SiteLocale) =>
	siteConfig.navigation.map((item) => ({
		...(item.external === true ? { external: true } : {}),
		text: localizeNavigationLabel(locale, item.label),
		url: item.external === true ? item.href : localizePath(locale, item.href),
	}))

export const baseLayoutOptions = (locale: SiteLocale): BaseLayoutProps => ({
	i18n: i18nConfig,
	links: navigationLinks(locale),
	nav: {
		title: siteConfig.name,
		url: localizePath(locale, '/'),
	},
	searchToggle: { enabled: true },
	slots: { navTitle: NavigationBrand },
})

export const docsLayoutOptions = (locale: SiteLocale): BaseLayoutProps => ({
	...baseLayoutOptions(locale),
	links: navigationLinks(locale).filter(
		(item) => item.url !== localizePath(locale, siteConfig.routes.docs),
	),
	slots: {},
})
