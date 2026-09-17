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
		`${origin}/api/search?query=${encodeURIComponent(query)}`,
	)
	expect(response.ok()).toBe(true)
	return JSON.stringify(await response.json())
}

describe('website preview audit', () => {
	it('exposes the current docs version', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			await page.goto(`${origin}/docs/1.0.0`)
			const versionSelector = page
				.locator('#nd-sidebar')
				.getByRole('button', { exact: true, name: 'Version 1.0.0' })
			await versionSelector.waitFor()
			await versionSelector.click()
			expect(
				await page
					.getByRole('link', { exact: true, name: 'Version 1.0.0' })
					.count(),
			).toBe(1)
			expect(await accessibilityViolations(page)).toEqual([])
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

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
			expect(
				await page
					.locator('#nd-nav')
					.getByRole('link', { name: 'Plugins' })
					.getAttribute('href'),
			).toBe('/docs/1.0.0/plugins/overview#official-plugins')
			await page.getByRole('link', { name: 'Explore the docs' }).click()
			await page.waitForURL(`${origin}/docs/1.0.0`)
			await page
				.getByRole('heading', { level: 1, name: 'What is UltimaBase' })
				.waitFor()

			expect(
				await page
					.locator('#nd-sidebar')
					.getByRole('link', { name: 'Examples' })
					.count(),
			).toBe(0)
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('renders Core, flat official-plugin, and community journeys', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const sidebar = page.locator('#nd-sidebar')

			await page.goto(`${origin}/docs/1.0.0/core/application`)
			await sidebar.getByText('Core', { exact: true }).waitFor()
			await sidebar.getByText('Application', { exact: true }).waitFor()

			await page.goto(`${origin}/docs/1.0.0/plugins/official/soft-delete`)
			await sidebar
				.getByRole('button', { exact: true, name: 'Official Plugins' })
				.waitFor()
			await sidebar
				.getByRole('link', { exact: true, name: 'Soft Delete' })
				.waitFor()
			expect(
				await sidebar
					.getByRole('button', { exact: true, name: 'Data and Persistence' })
					.count(),
			).toBe(0)
			await page.goto(`${origin}/docs/1.0.0/plugins/community-plugins`)
			await sidebar
				.getByRole('link', { exact: true, name: 'Community Plugins' })
				.waitFor()
			await page
				.getByRole('heading', { level: 1, name: 'Community Plugins' })
				.waitFor()
		} finally {
			await context.close()
		}
	})

	it('does not publish removed documentation and examples routes', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			for (const route of [
				'/examples',
				'/examples/model-the-schema',
				'/docs',
				'/docs/1.0.0/getting-started/introduction',
				'/docs/1.0.0/getting-started/installation',
				'/docs/1.0.0/getting-started/first-application',
				'/docs/1.0.0/plugins/official/data-and-persistence/soft-delete',
				'/docs/1.0.0/plugins/official/http-and-apis/graphql',
				'/docs/1.0',
				'/status/release-status',
				'/status/roadmap',
				'/status/contributing',
			]) {
				const response = await page.request.get(`${origin}${route}`, {
					maxRedirects: 0,
				})
				expect(response.status(), route).toBe(404)
			}
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
			await page.goto(`${origin}/docs/1.0.0/manual-installation`)
			await page
				.getByRole('heading', { level: 1, name: 'Manual Installation' })
				.waitFor()
			expect(await page.getByRole('main').count()).toBe(1)
			expect(
				await page.getByRole('button', { name: 'Copy Text' }).count(),
			).toBeGreaterThan(0)
			expect(await accessibilityViolations(page)).toEqual([])

			await page.goto(origin)
			await page
				.getByRole('figure', { name: /Different APIs.*Same rules/u })
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
				'/docs/1.0.0/manual-installation',
			)
			expect(await publicSearch(page, '@ultimabase/core')).toContain(
				'/docs/1.0.0/reference/package-index',
			)
			expect(await publicSearch(page, 'HTTP_APPLICATION_REJECTED')).toContain(
				'/docs/1.0.0/plugins/official/http',
			)
			await page.goto(`${origin}/docs/1.0.0`)
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
		['/docs/1.0.0/quick-start', 'Quick Start'],
		['/docs/1.0.0/manual-installation', 'Manual Installation'],
		['/docs/1.0.0/core/runtime/runtime-pipeline', 'Runtime Pipeline'],
		['/docs/1.0.0/plugins/using-plugins', 'Using Plugins'],
		[
			'/docs/1.0.0/plugins/official/password-authentication',
			'Password Authentication',
		],
		['/docs/1.0.0/operations/troubleshooting', 'Troubleshooting'],
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
				expect(
					await page.locator('main a[href*="/docs/1.0.0/adr/"]').count(),
				).toBe(0)
			} finally {
				await context.close()
			}
		},
	)

	it.each([
		['/docs/1.0.0/project/release-status', 'Release Status'],
		['/docs/1.0.0/project/roadmap', 'Roadmap'],
		['/docs/1.0.0/project/contributing', 'Contributing'],
	])('serves the project documentation at %s', async (route, title) => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			const response = await page.goto(`${origin}${route}`)
			expect(response?.status()).toBe(200)
			await page.getByRole('heading', { level: 1, name: title }).waitFor()
			const sidebar = page.locator('#nd-sidebar')
			await sidebar.getByText('Project', { exact: true }).waitFor()
			for (const [name, href] of [
				['Release Status', siteConfig.routes.releaseStatus],
				['Roadmap', siteConfig.routes.roadmap],
				['Contributing', siteConfig.routes.contributing],
			] as const) {
				expect(
					await sidebar
						.getByRole('link', { name, exact: true })
						.getAttribute('href'),
				).toBe(href)
			}
			expect(
				await page.locator('meta[name="robots"]').getAttribute('content'),
			).toContain('noindex')
			expect(await accessibilityViolations(page)).toEqual([])
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('does not publish translated project routes', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const response = await page.goto(
				`${origin}/fr/docs/1.0.0/project/release-status`,
			)
			expect(response?.status()).toBe(404)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Page not found',
				})
				.waitFor()
			expect(await accessibilityViolations(page)).toEqual([])
			for (const path of ['/fr/docs/1.0.0', '/en/docs/1.0.0']) {
				const oldLanguageRoute = await page.request.get(`${origin}${path}`)
				expect(oldLanguageRoute.status()).toBe(404)
			}
		} finally {
			await context.close()
		}
	})

	it('serves provisional technical metadata and a branded 404', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')
		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0`)
			expect(
				await page.locator('meta[property="og:title"]').getAttribute('content'),
			).toBe('What is UltimaBase')
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
