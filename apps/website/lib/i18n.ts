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
			'Close Sidebar(aria-label)': 'Fermer la barre latérale',
			'Close Sidebar(sidebar)(aria-label)': 'Fermer la barre latérale',
			'Collapse Sidebar(sidebar)(aria-label)': 'Réduire la barre latérale',
			'Copied Text(code block)(aria-label)': 'Texte copié',
			'Copy Anchor Link(heading anchor)(aria-label)': 'Copier le lien du titre',
			'Copy Text(code block)(aria-label)': 'Copier le code',
			'Dark(theme switcher)(aria-label)': 'Thème sombre',
			'Edit on GitHub(edit page)': 'Modifier sur GitHub',
			'Choose a language(language switcher)': 'Choisir une langue',
			'Choose a language(language switcher)(aria-label)': 'Choisir une langue',
			'Close Search(search dialog)(aria-label)': 'Fermer la recherche',
			'Light(theme switcher)(aria-label)': 'Thème clair',
			'Last updated on(page footer)': 'Dernière mise à jour le',
			'Next Page(pagination)': 'Page suivante',
			'No results found(search dialog)': 'Aucun résultat',
			'On this page(table of contents)': 'Sur cette page',
			'Open Search(search trigger)(aria-label)': 'Ouvrir la recherche',
			'Open Sidebar(sidebar)(aria-label)': 'Ouvrir la barre latérale',
			'Previous Page(pagination)': 'Page précédente',
			'Search(search dialog)': 'Rechercher',
			'Search(search trigger)': 'Rechercher',
			'System(theme switcher)(aria-label)': 'Thème du système',
			'Toggle Menu(mobile menu)(aria-label)': 'Ouvrir le menu',
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

const frenchNavigationLabels: Readonly<Record<string, string>> = Object.freeze({
	Docs: 'Documentation',
	Examples: 'Exemples',
	GitHub: 'GitHub',
})

export function localizeNavigationLabel(
	locale: SiteLocale,
	label: string,
): string {
	return locale === 'fr' ? (frenchNavigationLabels[label] ?? label) : label
}
