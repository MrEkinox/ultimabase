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
			await page.goto(`${origin}/docs/1.0`)
			const versionSelector = page
				.locator('#nd-sidebar')
				.getByRole('button', { exact: true, name: '1.0' })
			await versionSelector.waitFor()
			await versionSelector.click()
			expect(
				await page.getByRole('link', { exact: true, name: '1.0' }).count(),
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
			).toBe('/docs/1.0/plugins/overview')
			await page.getByRole('link', { name: 'Start building' }).click()
			await page.waitForURL(`${origin}/docs/1.0/getting-started/installation`)
			await page
				.getByRole('heading', { level: 1, name: 'Installation' })
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

	it('renders the nested Core, official-plugin, and community journeys', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const sidebar = page.locator('#nd-sidebar')

			await page.goto(`${origin}/docs/1.0/core/application/application-graph`)
			await sidebar.getByText('Core', { exact: true }).waitFor()
			await sidebar.getByText('Application', { exact: true }).waitFor()

			await page.goto(
				`${origin}/docs/1.0/plugins/official/data-and-persistence/soft-delete`,
			)
			await sidebar
				.getByRole('button', { exact: true, name: 'Official Plugins' })
				.waitFor()
			await sidebar
				.getByRole('button', { exact: true, name: 'Data and Persistence' })
				.waitFor()
			await sidebar
				.getByRole('link', { exact: true, name: 'Soft Delete' })
				.waitFor()
			expect(
				await sidebar
					.getByRole('button', { exact: true, name: 'Soft Delete' })
					.count(),
			).toBe(0)

			await page.goto(`${origin}/docs/1.0/plugins/community-plugins`)
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

	it('makes every project status page discoverable from the landing page', async () => {
		const context = await browser?.newContext({
			colorScheme: 'dark',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)
			await page.goto(origin)
			const projectInformation = page.getByRole('navigation', {
				name: 'Project information',
			})
			for (const [label, route] of [
				['Release status', siteConfig.routes.releaseStatus],
				['Roadmap', siteConfig.routes.roadmap],
				['Contributing', siteConfig.routes.contributing],
			] as const) {
				expect(
					await projectInformation
						.getByRole('link', { name: label })
						.getAttribute('href'),
				).toBe(route)
			}
			await projectInformation
				.getByRole('link', { name: 'Release status' })
				.click()
			await page.waitForURL(`${origin}${siteConfig.routes.releaseStatus}`)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Built enough to evaluate. Early enough to change.',
				})
				.waitFor()
			expect(clientErrors).toEqual([])
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
				'/docs/1.0/getting-started/introduction',
				'/docs/1.0/mutations/soft-delete',
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
			await page.goto(`${origin}/docs/1.0/getting-started/first-application`)
			await page
				.getByRole('heading', { level: 1, name: 'First Application' })
				.waitFor()
			expect(await page.getByRole('main').count()).toBe(1)
			expect(
				await page.getByRole('button', { name: 'Copy Text' }).count(),
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
				'/docs/1.0/getting-started/installation',
			)
			expect(await publicSearch(page, '@ultimabase/core')).toContain(
				'/docs/1.0/reference/package-index',
			)
			expect(await publicSearch(page, 'HTTP_APPLICATION_REJECTED')).toContain(
				'/docs/1.0/plugins/official/http-and-apis/http',
			)
			await page.goto(`${origin}/docs/1.0`)
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
		['/docs/1.0/getting-started/installation', 'Installation'],
		['/docs/1.0/getting-started/first-application', 'First Application'],
		['/docs/1.0/core/runtime/runtime-pipeline', 'Runtime Pipeline'],
		['/docs/1.0/plugins/using-plugins', 'Using Plugins'],
		[
			'/docs/1.0/guides/build-an-authenticated-api',
			'Build an Authenticated API',
		],
		[
			'/docs/1.0/operations/application-troubleshooting',
			'Application Troubleshooting',
		],
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
					await page.locator('main a[href*="/docs/1.0/adr/"]').count(),
				).toBe(0)
			} finally {
				await context.close()
			}
		},
	)

	it.each([
		[
			'/status/release-status',
			'Built enough to evaluate. Early enough to change.',
		],
		[
			'/status/roadmap',
			'Evidence first. Milestones second. Dates never invented.',
		],
		['/status/contributing', 'Make one change easy to understand and trust.'],
	])('serves the source-backed status page at %s', async (route, title) => {
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
			expect(
				await page.getByRole('navigation', { name: 'Status pages' }).count(),
			).toBe(1)
			expect(
				await page.locator('meta[name="robots"]').getAttribute('content'),
			).toContain('noindex')
			expect(await accessibilityViolations(page)).toEqual([])
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('does not publish a translated status route', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const response = await page.goto(`${origin}/fr/status/release-status`)
			expect(response?.status()).toBe(404)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Page not found',
				})
				.waitFor()
			expect(await accessibilityViolations(page)).toEqual([])
			for (const path of ['/fr/docs/1.0', '/en/docs/1.0']) {
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
			await page.goto(`${origin}/docs/1.0`)
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
