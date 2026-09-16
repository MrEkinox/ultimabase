import type { Browser } from 'playwright'
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

describe('website visual system', () => {
	it.each([
		{
			colorScheme: 'light' as const,
			customShell: true,
			path: '/',
			width: 1280,
		},
		{
			colorScheme: 'dark' as const,
			customShell: false,
			path: '/docs',
			width: 375,
		},
	])(
		'keeps the $colorScheme $path shell accessible',
		async ({ colorScheme, customShell, path, width }) => {
			const context = await browser?.newContext({
				colorScheme,
				viewport: { height: 900, width },
			})
			if (context === undefined) throw new Error('Browser did not start')

			try {
				const page = await context.newPage()
				await page.goto(`${origin}${path}`)
				await expect
					.poll(() =>
						page.evaluate(() =>
							document.documentElement.classList.contains('dark'),
						),
					)
					.toBe(colorScheme === 'dark')
				const header = page.locator(path === '/' ? '#nd-nav' : '#nd-subnav')
				await header.waitFor({ state: 'visible' })
				if (customShell) {
					await header.locator('[data-brand]').waitFor({ state: 'visible' })
					await page.locator('[data-site-footer]').waitFor({ state: 'visible' })
				} else {
					expect(await header.locator('[data-brand]').count()).toBe(0)
					expect(await page.locator('[data-site-footer]').count()).toBe(0)
				}

				await page.keyboard.press('Tab')
				const focusOutlineWidth = await page.evaluate(() => {
					const activeElement = document.activeElement
					if (!(activeElement instanceof HTMLElement)) return 0
					return Number.parseFloat(getComputedStyle(activeElement).outlineWidth)
				})
				if (customShell) expect(focusOutlineWidth).toBeGreaterThanOrEqual(3)
				expect(await accessibilityViolations(page)).toEqual([])
			} finally {
				await context.close()
			}
		},
	)

	it('remains readable on narrow and 200% zoom-equivalent layouts', async () => {
		const context = await browser?.newContext({
			viewport: { height: 812, width: 375 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(origin)
			await page
				.getByRole('heading', { level: 1 })
				.waitFor({ state: 'visible' })
			await page
				.getByRole('link', { name: 'Start building' })
				.waitFor({ state: 'visible' })
			await page
				.getByRole('figure', { name: 'Three entry points. One Runtime.' })
				.waitFor({ state: 'attached' })
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true)

			// A 320 CSS-pixel viewport represents a 640-pixel window at 200% zoom.
			await page.setViewportSize({ height: 720, width: 320 })
			await page
				.getByRole('heading', { level: 1 })
				.waitFor({ state: 'visible' })
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true)
		} finally {
			await context.close()
		}
	})

	it('connects navigation, calls to action, and theme without client errors', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)

			await page.goto(origin)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Define your data once. Keep every API honest.',
				})
				.waitFor({ state: 'visible' })

			expect(
				await page
					.locator('#nd-nav')
					.getByRole('link', { name: 'Docs' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.docs)
			expect(
				await page
					.getByRole('link', { name: 'Start building' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.gettingStarted)
			expect(
				await page
					.getByRole('link', { name: 'View on GitHub' })
					.getAttribute('href'),
			).toBe(siteConfig.repositoryUrl.href)
			expect(
				await page
					.getByRole('link', { name: 'Read release status' })
					.getAttribute('href'),
			).toBe('/status/release-status')

			const root = page.locator('html')
			expect((await root.getAttribute('class')) ?? '').not.toContain('dark')
			await page.getByRole('button', { name: 'Toggle Theme' }).click()
			await expect
				.poll(async () => (await root.getAttribute('class'))?.includes('dark'))
				.toBe(true)
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('keeps search inside the English documentation', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const clientErrors = collectClientErrors(page)

			await page.goto(`${origin}/docs`)
			expect(page.url()).toBe(`${origin}/docs/1.0`)
			expect(await page.locator('html').getAttribute('lang')).toBe('en')
			expect(clientErrors).toEqual([])

			await page.locator('button[data-search-full]').click()
			const searchDialog = page.getByRole('dialog')
			await searchDialog.waitFor({ state: 'visible' })
			expect(clientErrors).toEqual([])
			await searchDialog.getByRole('textbox').fill('canonical')
			await searchDialog
				.getByRole('button', { name: /Documentation/u })
				.first()
				.waitFor({ state: 'visible' })
			expect(clientErrors).toEqual([])
			await page.keyboard.press('Escape')
			expect(clientErrors).toEqual([])

			expect(
				await page.getByRole('button', { name: 'Choose a language' }).count(),
			).toBe(0)

			const privateSearch = await page.request.get(
				`${origin}/api/search?query=ADR-0191`,
			)
			expect(privateSearch.ok()).toBe(true)
			const architectureResults: unknown = await privateSearch.json()
			expect(Array.isArray(architectureResults)).toBe(true)
			if (!Array.isArray(architectureResults)) {
				throw new TypeError('Search results must be an array')
			}
			expect(
				architectureResults.every(
					(result: unknown) =>
						typeof result === 'object' &&
						result !== null &&
						'url' in result &&
						typeof result.url === 'string' &&
						result.url.startsWith('/docs/1.0/') &&
						!result.url.startsWith('/docs/1.0/adr/'),
				),
			).toBe(true)
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('removes decorative motion when reduced motion is requested', async () => {
		const context = await browser?.newContext({
			reducedMotion: 'reduce',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(origin)
			const surface = page.getByTestId('visual-system-motion')
			await surface.hover()
			const motion = await surface.evaluate((element) => {
				const style = getComputedStyle(element)
				return {
					transform: style.transform,
					transitionDuration: style.transitionDuration,
				}
			})

			expect(motion.transform).toBe('none')
			expect(
				motion.transitionDuration
					.split(', ')
					.every((duration) => Number.parseFloat(duration) <= 0.000_01),
			).toBe(true)
		} finally {
			await context.close()
		}
	})
})
