import type { SiteLocale } from './i18n'

export type DocumentationPageResolution<Page> =
	| { readonly kind: 'page'; readonly page: Page }
	| { readonly englishPage: Page; readonly kind: 'translation-fallback' }
	| { readonly kind: 'not-found' }

export function resolveDocumentationPage<Page>(
	locale: SiteLocale,
	localizedPage: Page | undefined,
	englishPage: Page | undefined,
): DocumentationPageResolution<Page> {
	if (localizedPage !== undefined) return { kind: 'page', page: localizedPage }
	if (locale === 'fr' && englishPage !== undefined) {
		return { englishPage, kind: 'translation-fallback' }
	}
	return { kind: 'not-found' }
}
