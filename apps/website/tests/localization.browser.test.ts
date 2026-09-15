import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	accessibilityViolations,
	collectClientErrors,
	startWebsiteBrowserHarness,
	type WebsiteBrowserHarness,
} from './browser-harness'
import { siteConfig } from '../lib/site'

let browser: Browser | undefined
let harness: WebsiteBrowserHarness | undefined
let origin = ''

beforeAll(async () => {
	harness = await startWebsiteBrowserHarness()
	browser = harness.browser
	origin = harness.origin
})

afterAll(async () => {
	await harness?.close()
})

describe('French public journey', () => {
	it('publishes the localized landing with canonical alternatives', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			await page.goto(`${origin}/fr`)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Définissez vos données une fois. Gardez des API cohérentes.',
				})
				.waitFor({ state: 'visible' })

			expect(await page.locator('html').getAttribute('lang')).toBe('fr')
			expect(
				await page
					.locator('#nd-nav')
					.getByRole('link', { name: 'Documentation' })
					.getAttribute('href'),
			).toBe('/fr/docs/1.0')
			expect(
				await page
					.getByRole('link', { name: 'Commencer' })
					.getAttribute('href'),
			).toBe('/fr/docs/1.0/getting-started/introduction')
			expect(await page.locator('pre').first().textContent()).toContain(
				"from '@ultimabase/core'",
			)
			expect(
				await page.locator('link[rel="canonical"]').getAttribute('href'),
			).toBe(new URL('/fr', siteConfig.canonicalUrl).href)
			expect(
				await page.locator('link[hreflang="en"]').getAttribute('href'),
			).toBe(siteConfig.canonicalUrl.origin)
			expect(await accessibilityViolations(page)).toEqual([])
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('preserves translated pages and makes missing content explicit', async () => {
		const context = await browser?.newContext({
			colorScheme: 'dark',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			await page.goto(`${origin}/docs/getting-started/first-application`)
			expect(page.url()).toBe(
				`${origin}/docs/1.0/getting-started/first-application`,
			)
			await page.getByRole('button', { name: 'Choose a language' }).click()
			await page.getByText('Français', { exact: true }).click()
			await page.waitForURL(
				`${origin}/fr/docs/1.0/getting-started/first-application`,
			)
			await page
				.getByRole('heading', { level: 1, name: 'Première application' })
				.waitFor({ state: 'visible' })
			expect(await page.locator('pre').count()).toBe(4)
			await page.getByText('Sur cette page', { exact: true }).waitFor()
			await page.getByRole('button', { name: 'Choisir une langue' }).waitFor()
			await page
				.locator('article a[href="/fr/docs/1.0/getting-started/installation"]')
				.waitFor()
			await page
				.locator(
					'article a[href="/fr/docs/1.0/getting-started/project-structure"]',
				)
				.waitFor()
			expect(
				await page.locator('link[rel="canonical"]').getAttribute('href'),
			).toBe(
				new URL(
					'/fr/docs/1.0/getting-started/first-application',
					siteConfig.canonicalUrl,
				).href,
			)
			const editLink = page.getByRole('link', { name: 'Modifier sur GitHub' })
			expect(await editLink.getAttribute('href')).toBe(
				'https://github.com/MrEkinox/ultimadatabase/blob/main/apps/website/content/docs/fr/1.0/getting-started/first-application.mdx',
			)
			await page
				.getByText('Dernière mise à jour le', { exact: false })
				.waitFor()

			const search = await page.request.get(
				`${origin}/api/search?query=préversion&locale=fr`,
			)
			expect(search.ok()).toBe(true)
			expect(JSON.stringify(await search.json())).toContain(
				'/fr/docs/1.0/getting-started',
			)

			await page.goto(`${origin}/fr/docs/querying/overview`)
			expect(page.url()).toBe(
				`${origin}/fr/docs/1.0/core/reading-data/overview`,
			)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Cette page n’est pas encore disponible en français.',
				})
				.waitFor({ state: 'visible' })
			expect(
				await page
					.getByRole('link', { name: 'Lire la source anglaise' })
					.getAttribute('href'),
			).toBe('/docs/1.0/core/reading-data/overview')
			expect(await accessibilityViolations(page)).toEqual([])
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('publishes Core documentation in English and falls back explicitly in French', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			await page.goto(`${origin}/docs/1.0/core/application/application-graph`)
			await page
				.getByRole('heading', { level: 1, name: 'Application Graph' })
				.waitFor()
			await page
				.locator('#nd-sidebar')
				.getByText('Core', { exact: true })
				.waitFor()
			expect(await accessibilityViolations(page)).toEqual([])

			await page.goto(
				`${origin}/fr/docs/1.0/core/application/application-graph`,
			)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Cette page n’est pas encore disponible en français.',
				})
				.waitFor()
			expect(
				await page
					.getByRole('link', { name: 'Lire la source anglaise' })
					.getAttribute('href'),
			).toBe('/docs/1.0/core/application/application-graph')
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})
})
