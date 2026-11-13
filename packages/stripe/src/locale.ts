// The payer's language on Stripe's pages (D-382): each page knows its own
// list, and refuses a locale outside it.

const shared = [
	'bg',
	'cs',
	'da',
	'de',
	'el',
	'en',
	'en-GB',
	'es',
	'es-419',
	'et',
	'fi',
	'fil',
	'fr',
	'fr-CA',
	'hr',
	'hu',
	'id',
	'it',
	'ja',
	'ko',
	'lt',
	'lv',
	'ms',
	'mt',
	'nb',
	'nl',
	'pl',
	'pt',
	'pt-BR',
	'ro',
	'ru',
	'sk',
	'sl',
	'sv',
	'th',
	'tr',
	'vi',
	'zh',
	'zh-HK',
	'zh-TW',
]

/** The locales Checkout knows. */
export const checkoutLocales: ReadonlySet<string> = new Set([
	...shared,
	'hi-IN',
])

/** The locales the portal knows. */
export const portalLocales: ReadonlySet<string> = new Set([
	...shared,
	'en-AU',
	'en-CA',
	'en-IE',
	'en-IN',
	'en-NZ',
	'en-SG',
])

/** `locale` made canonical, or `null` when it is not a locale. */
function canonical(locale: string): string | null {
	try {
		return Intl.getCanonicalLocales(locale)[0] ?? null
	} catch {
		return null
	}
}

/**
 * The page's locale for `locale`: itself when the page knows it, else its
 * language when the page knows it, else `'auto'`, the page's own choice.
 */
export function pageLocale(
	locale: string | null,
	known: ReadonlySet<string>,
): string {
	const exact = locale === null ? null : canonical(locale)
	if (exact === null) return 'auto'
	if (known.has(exact)) return exact
	const [language = ''] = exact.split('-')
	return known.has(language) ? language : 'auto'
}
