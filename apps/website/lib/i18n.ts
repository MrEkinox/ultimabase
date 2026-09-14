import { defineI18n, type I18nConfig } from 'fumadocs-core/i18n'
import { uiTranslations } from 'fumadocs-ui/i18n'

export const supportedLocales = ['en', 'fr'] as const

export type SiteLocale = (typeof supportedLocales)[number]

export const i18nConfig = {
	defaultLanguage: 'en',
	fallbackLanguage: null,
	hideLocale: 'default-locale',
	languages: [...supportedLocales],
	parser: 'dir',
} satisfies I18nConfig<SiteLocale>

export const i18n = defineI18n(i18nConfig)

export const translations = i18n
	.translations()
	.extend(uiTranslations())
	.add({
		en: { displayName: 'English' },
		fr: {
			'Choose a language(language switcher)': 'Choisir une langue',
			'Choose a language(language switcher)(aria-label)': 'Choisir une langue',
			'Close Search(search dialog)(aria-label)': 'Fermer la recherche',
			'No results found(search dialog)': 'Aucun résultat',
			'Open Search(search trigger)(aria-label)': 'Ouvrir la recherche',
			'Search(search dialog)': 'Rechercher',
			'Search(search trigger)': 'Rechercher',
			'Toggle Theme(theme switcher)(aria-label)': 'Changer de thème',
			displayName: 'Français',
		},
	})

export function isSiteLocale(value: string): value is SiteLocale {
	return supportedLocales.some((locale) => locale === value)
}

export function localizePath(locale: SiteLocale, path: string): string {
	if (locale === i18n.defaultLanguage) return path
	if (path === '/') return `/${locale}`
	return `/${locale}${path}`
}
