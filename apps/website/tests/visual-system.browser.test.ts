import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { currentDocumentationPath } from '../lib/docs-versions'
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
	it('keeps the docs sidebar focused and GitHub beside the theme switch', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0`)
			const sidebar = page.locator('#nd-sidebar')
			await sidebar.getByRole('link', { name: 'What is UltimaBase' }).waitFor()
			expect(
				await sidebar
					.getByRole('link', { name: 'Plugins', exact: true })
					.count(),
			).toBe(0)
			const github = sidebar.getByRole('link', { name: 'GitHub' })
			expect(await github.getAttribute('href')).toBe(
				siteConfig.repositoryUrl.href,
			)
			const githubBox = await github.boundingBox()
			const themeBox = await sidebar
				.locator('[data-theme-toggle]')
				.boundingBox()
			const sidebarBox = await sidebar.boundingBox()
			expect(githubBox).not.toBeNull()
			expect(themeBox).not.toBeNull()
			expect(sidebarBox).not.toBeNull()
			if (githubBox && themeBox && sidebarBox) {
				expect(Math.abs(githubBox.y - themeBox.y)).toBeLessThan(12)
				expect(sidebarBox.y + sidebarBox.height - githubBox.y).toBeLessThan(100)
			}
		} finally {
			await context.close()
		}
	})

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
			path: '/docs/1.0.0',
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
					expect(await page.getByRole('contentinfo').count()).toBe(0)
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
				.getByRole('link', { name: 'Explore the documentation' })
				.waitFor({ state: 'visible' })
			await page
				.getByRole('figure', { name: /Different APIs.*Same rules/u })
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
					name: /Your data model.*A working backend/u,
				})
				.waitFor({ state: 'visible' })
			await page.getByRole('tab', { name: 'Write', exact: true }).waitFor()
			const applicationPreview = page.getByRole('region', {
				name: 'Example application configuration',
			})
			expect(
				await applicationPreview
					.getByRole('link', { name: 'Configure an application' })
					.getAttribute('href'),
			).toBe(currentDocumentationPath('core/application'))
			expect(
				await page
					.locator('#nd-nav')
					.getByRole('link', { name: 'Documentation' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.docs)
			expect(
				await page
					.locator('#nd-nav')
					.getByRole('link', { name: 'Plugins' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.plugins)
			expect(
				await page
					.getByRole('link', { name: 'Explore the documentation' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.docs)
			expect(
				await page
					.getByRole('link', { name: 'View runnable example' })
					.getAttribute('href'),
			).toBe(siteConfig.sourceExampleUrl.href)
			expect(
				await page
					.getByRole('link', { name: 'Open the runnable example' })
					.getAttribute('href'),
			).toBe(siteConfig.sourceExampleUrl.href)
			expect(
				await page
					.getByRole('link', { name: 'Access rules' })
					.getAttribute('href'),
			).toBe(currentDocumentationPath('plugins/official/access'))
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

			await page.goto(`${origin}/docs/1.0.0`)
			expect(page.url()).toBe(`${origin}/docs/1.0.0`)
			expect(await page.locator('html').getAttribute('lang')).toBe('en')
			expect(clientErrors).toEqual([])

			await page.locator('button[data-search-full]').click()
			const searchDialog = page.getByRole('dialog')
			await searchDialog.waitFor({ state: 'visible' })
			expect(clientErrors).toEqual([])
			await searchDialog.getByRole('textbox').fill('What is UltimaBase')
			await searchDialog
				.getByRole('button', { name: /What is UltimaBase/u })
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
						result.url.startsWith('/docs/1.0.0/') &&
						!result.url.startsWith('/docs/1.0.0/adr/'),
				),
			).toBe(true)
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('keeps one package-manager choice across manual installation', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/manual-installation`)
			const yarnTabs = page.getByRole('tab', { exact: true, name: 'yarn' })
			expect(await yarnTabs.count()).toBe(5)
			await yarnTabs.first().click()
			for (const tab of await yarnTabs.all()) {
				expect(await tab.getAttribute('data-state')).toBe('active')
			}
			const activeCommands = await page
				.locator('[role="tabpanel"][data-state="active"]')
				.allTextContents()
			expect(activeCommands.join('\n')).toContain('yarn init -y')
			expect(activeCommands.join('\n')).toContain('yarn tsc --version')
			expect(activeCommands.join('\n')).toContain('yarn typecheck')
		} finally {
			await context.close()
		}
	})

	it('uses native page navigation for linear steps and cards for choices', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const linearJourneys = [
				['/docs/1.0.0', '/docs/1.0.0/manual-installation'],
				[
					'/docs/1.0.0/core/reading-data/ordering-and-pagination',
					'/docs/1.0.0/core/reading-data/related-data',
				],
			] as const

			for (const [path, next] of linearJourneys) {
				await page.goto(`${origin}${path}`)
				const redundantHeading = page.locator('main h2:has-text("Next steps")')
				expect(await redundantHeading.count()).toBe(0)
				const nextLink = page.locator(`main a[href="${next}"]`)
				expect(await nextLink.count()).toBeGreaterThan(0)
			}

			await page.goto(`${origin}/docs/1.0.0/manual-installation`)
			const gettingStartedCards = page
				.getByRole('heading', { level: 2, name: 'Next steps' })
				.locator('xpath=following-sibling::div[1]')
				.locator('a[data-card]')
			expect(await gettingStartedCards.count()).toBe(8)
			expect(
				await gettingStartedCards
					.filter({ hasText: 'Test the application' })
					.count(),
			).toBe(1)
			await page.goto(`${origin}/docs/1.0.0/core/reading-data/selections`)
			const cards = page
				.getByRole('heading', { level: 2, name: 'Next steps' })
				.locator('xpath=following-sibling::div[1]')
				.locator('a[data-card]')
			expect(await cards.locator('h3').allTextContents()).toEqual([
				'Ordering and Pagination',
				'Related Data',
			])
			await cards.nth(1).click()
			await page.waitForURL(
				`${origin}/docs/1.0.0/core/reading-data/related-data`,
			)
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
