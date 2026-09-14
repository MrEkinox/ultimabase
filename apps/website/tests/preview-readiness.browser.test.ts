import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { siteConfig } from '../lib/site'
import {
	accessibilityViolations,
	collectClientErrors,
	startWebsiteBrowserHarness,
	type WebsiteBrowserHarness,
} from './browser-harness'

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

async function publicSearch(page: Page, query: string): Promise<string> {
	const response = await page.request.get(
		`${origin}/api/search?query=${encodeURIComponent(query)}&locale=en`,
	)
	expect(response.ok()).toBe(true)
	return JSON.stringify(await response.json())
}

describe('website preview audit', () => {
	it('completes the primary navigation and call-to-action path', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			await page.goto(origin)
			await page.getByRole('link', { name: 'Start building' }).click()
			await page.waitForURL(`${origin}/docs/getting-started/introduction`)
			await page
				.getByRole('heading', { level: 1, name: 'Introduction' })
				.waitFor()

			await page
				.locator('#nd-sidebar')
				.getByRole('link', { name: 'Examples' })
				.click()
			await page.waitForURL(`${origin}/examples`)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Learn from the application we actually test.',
				})
				.waitFor()
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('keeps code, diagrams, landmarks, and contrast accessible', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/fr/docs/getting-started/first-application`)
			await page
				.getByRole('heading', { level: 1, name: 'Première application' })
				.waitFor()
			expect(await page.getByRole('main').count()).toBe(1)
			expect(
				await page.getByRole('button', { name: 'Copier le code' }).count(),
			).toBeGreaterThan(0)
			expect(await accessibilityViolations(page)).toEqual([])

			await page.goto(origin)
			await page
				.getByRole('figure', { name: 'Three entry points. One Runtime.' })
				.waitFor()
			expect(await accessibilityViolations(page)).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('answers representative search tasks and handles zero results by keyboard', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			expect(await publicSearch(page, 'install')).toContain(
				'/docs/getting-started/installation',
			)
			expect(await publicSearch(page, '@ultimabase/core')).toContain(
				'/docs/reference/packages',
			)
			expect(await publicSearch(page, 'HTTP_APPLICATION_REJECTED')).toContain(
				'/docs/troubleshooting/http-and-application-identity',
			)
			const french = await page.request.get(
				`${origin}/api/search?query=${encodeURIComponent('préversion')}&locale=fr`,
			)
			expect(french.ok()).toBe(true)
			expect(JSON.stringify(await french.json())).toContain('/fr/docs')

			await page.goto(`${origin}/docs`)
			const dialog = page.getByRole('dialog')
			await page.locator('button[data-search-full]').click()
			await dialog.waitFor()
			await page.keyboard.press('Escape')
			await dialog.waitFor({ state: 'hidden' })
			await page.keyboard.press('Control+KeyK')
			await dialog.waitFor()
			await dialog.getByRole('textbox').fill('zzqxvbnm404fixture')
			await dialog.getByText('No results found', { exact: true }).waitFor()
			await page.keyboard.press('Escape')
			await dialog.waitFor({ state: 'hidden' })
			expect(await dialog.isVisible()).toBe(false)
		} finally {
			await context.close()
		}
	})

	it.each([
		['/docs/getting-started/installation', 'Installation'],
		['/docs/getting-started/first-application', 'First Application'],
		['/docs/plugins/installation', 'Install a Plugin'],
		['/docs/guides/build-an-authenticated-api', 'Build an Authenticated API'],
		['/docs/troubleshooting/startup', 'Startup and Plugin Graph'],
	])(
		'keeps the reader task at %s independently usable',
		async (route, title) => {
			const context = await browser?.newContext({
				viewport: { height: 900, width: 1280 },
			})
			if (context === undefined) throw new Error('Browser did not start')

			try {
				const page = await context.newPage()
				const response = await page.goto(`${origin}${route}`)
				expect(response?.status()).toBe(200)
				await page.getByRole('heading', { level: 1, name: title }).waitFor()
				expect(await page.locator('main a[href*="/docs/adr/"]').count()).toBe(0)
			} finally {
				await context.close()
			}
		},
	)

	it('serves provisional technical metadata and a branded 404', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/getting-started/introduction`)
			expect(
				await page.locator('meta[property="og:title"]').getAttribute('content'),
			).toBe('Introduction')
			expect(
				await page.locator('meta[name="twitter:card"]').getAttribute('content'),
			).toBe('summary')
			expect(
				await page.locator('meta[name="robots"]').getAttribute('content'),
			).toContain('noindex')

			for (const route of ['/sitemap.xml', '/robots.txt', '/icon']) {
				const response = await page.request.get(`${origin}${route}`)
				expect(response.ok(), route).toBe(true)
			}

			const missing = await page.goto(`${origin}/not-a-preview-route`)
			expect(missing?.status()).toBe(404)
			await page
				.getByRole('heading', { level: 1, name: 'Page not found' })
				.waitFor()
			expect(
				await page.getByText(siteConfig.name, { exact: true }).count(),
			).toBeGreaterThan(0)
		} finally {
			await context.close()
		}
	})
})
