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

beforeAll(async () => {
	harness = await startWebsiteBrowserHarness()
	browser = harness.browser
})

afterAll(async () => {
	await harness?.close()
})

describe('landing product proof', () => {
	it.each([
		{ colorScheme: 'light' as const, height: 900, width: 1440 },
		{ colorScheme: 'dark' as const, height: 900, width: 1440 },
		{ colorScheme: 'light' as const, height: 812, width: 375 },
		{ colorScheme: 'dark' as const, height: 812, width: 375 },
	])(
		'keeps the $colorScheme $width-pixel page readable and accessible',
		async ({ colorScheme, height, width }) => {
			const context = await browser?.newContext({
				colorScheme,
				viewport: { height, width },
			})
			if (context === undefined || harness === undefined)
				throw new Error('Browser did not start')
			try {
				const page = await context.newPage()
				const errors = collectClientErrors(page)
				await page.goto(harness.origin)
				const hero = page.locator('.ub-landing-hero')
				await hero.getByText('TypeScript backend framework').waitFor()
				const start = hero.getByRole('link', { name: 'Start building' })
				expect(await start.getAttribute('href')).toBe(
					'/docs/1.0.0/manual-installation',
				)
				const startBox = await start.boundingBox()
				expect(startBox?.y).toBeLessThan(height)
				const proofBox = await page.locator('.ub-proof').boundingBox()
				expect(proofBox?.y).toBeLessThan(height)
				await expect
					.poll(() =>
						page.evaluate(() =>
							document.documentElement.classList.contains('dark'),
						),
					)
					.toBe(colorScheme === 'dark')
				if (colorScheme === 'dark') {
					expect(
						await page
							.locator('.ub-landing')
							.evaluate((element) => getComputedStyle(element).backgroundColor),
					).toBe('rgb(0, 0, 0)')
				}
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth,
					),
				).toBe(true)
				// Long code must remain reachable without clipping either axis.
				for (const region of await page
					.locator('.ub-landing [role="region"]')
					.all()) {
					expect(
						await region.evaluate(
							(element) => element.scrollHeight <= element.clientHeight + 1,
						),
					).toBe(true)
				}
				expect(await accessibilityViolations(page)).toEqual([])
				expect(errors).toEqual([])
			} finally {
				await context.close()
			}
		},
	)

	it('switches examples with the keyboard and exposes complete code', async () => {
		const context = await browser?.newContext({
			viewport: { height: 812, width: 375 },
		})
		if (context === undefined || harness === undefined)
			throw new Error('Browser did not start')
		try {
			const page = await context.newPage()
			await page.goto(harness.origin, { waitUntil: 'networkidle' })
			const proof = page.locator('.ub-proof')
			const read = proof.getByRole('tab', { name: 'Read', exact: true })
			const write = proof.getByRole('tab', { name: 'Write', exact: true })
			await read.focus()
			await page.keyboard.press('ArrowRight')
			await expect
				.poll(() =>
					write.evaluate((element) => element === document.activeElement),
				)
				.toBe(true)
			await page.keyboard.press('Enter')
			await expect.poll(() => write.getAttribute('aria-selected')).toBe('true')
			expect(await proof.getByRole('tabpanel').textContent()).toContain(
				'Article.createOne',
			)
			await page.keyboard.press('ArrowLeft')
			await expect
				.poll(() =>
					read.evaluate((element) => element === document.activeElement),
				)
				.toBe(true)
			await page.keyboard.press('Enter')
			await expect.poll(() => read.getAttribute('aria-selected')).toBe('true')
			expect(await proof.getByRole('tabpanel').textContent()).toContain(
				'Article.findMany',
			)
			await page.setViewportSize({ height: 720, width: 320 })
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true)
		} finally {
			await context.close()
		}
	})

	it('resolves every landing documentation link and the official plugin navigation', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1440 },
		})
		if (context === undefined || harness === undefined)
			throw new Error('Browser did not start')
		try {
			const page = await context.newPage()
			await page.goto(harness.origin)
			const github = page
				.locator('#nd-nav')
				.getByRole('link', { name: 'GitHub', exact: true })
			expect(await github.locator('svg').count()).toBe(1)
			expect((await github.textContent())?.trim()).toBe('')
			expect(await github.getAttribute('href')).toBe(
				'https://github.com/MrEkinox/ultimadatabase',
			)
			const hrefs = await page
				.locator('.ub-landing a[href^="/docs/"]')
				.evaluateAll((links) => [
					...new Set(links.map((link) => link.getAttribute('href'))),
				])
			for (const href of hrefs) {
				if (href === null)
					throw new Error('Documentation link has no destination')
				const response = await page.request.get(
					new URL(href, harness.origin).href,
				)
				expect(response.status(), href).toBe(200)
			}
			await page
				.locator('#nd-nav')
				.getByRole('link', { name: 'Plugins' })
				.click()
			await page.waitForURL(
				`${harness.origin}/docs/1.0.0/plugins/overview#official-plugins`,
			)
			await page.locator('#official-plugins').waitFor()
		} finally {
			await context.close()
		}
	})
	it.each([375, 1280])(
		'makes project pages discoverable from the %i-pixel top bar',
		async (width) => {
			const context = await browser?.newContext({
				colorScheme: 'dark',
				viewport: { height: 900, width },
			})
			if (context === undefined || harness === undefined)
				throw new Error('Browser did not start')

			try {
				const page = await context.newPage()
				const clientErrors = collectClientErrors(page)
				await page.goto(harness.origin, { waitUntil: 'networkidle' })
				const projectInformation = page.locator('#nd-nav')
				if (width < 768)
					await projectInformation
						.getByRole('button', { name: 'Toggle Menu' })
						.click()
				else
					await projectInformation
						.getByRole('button', { name: 'Project' })
						.click()
				expect(await page.getByRole('contentinfo').count()).toBe(0)
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
				await page.waitForURL(
					`${harness.origin}${siteConfig.routes.releaseStatus}`,
				)
				await page
					.getByRole('heading', { level: 1, name: 'Release Status' })
					.waitFor()
				expect(clientErrors).toEqual([])
			} finally {
				await context.close()
			}
		},
	)
})
