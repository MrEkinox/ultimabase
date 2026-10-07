import type { Browser } from 'playwright'
import { compositionExamples } from '../components/landing/composition-content'
import { virtualFieldExample } from '../components/landing/capability-content'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	accessibilityViolations,
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

describe('landing transport and discovery additions', () => {
	it.each([
		{ width: 390, colorScheme: 'light' as const },
		{ width: 1440, colorScheme: 'dark' as const },
	])(
		'exposes all demos and answers at $width in $colorScheme',
		async ({ width, colorScheme }) => {
			const context = await browser?.newContext({
				viewport: { width, height: 900 },
				colorScheme,
			})
			if (!context || !harness) throw new Error('Browser did not start')
			try {
				const page = await context.newPage()
				await page.goto(harness.origin, { waitUntil: 'networkidle' })
				const transport = page.locator('.ub-transport')
				expect(await transport.locator('.ub-title-input').textContent()).toBe(
					'"  Hello UltimaBase  "',
				)
				const height = (await transport.boundingBox())?.height
				for (const label of ['TypeScript', 'REST', 'GraphQL']) {
					await transport.getByRole('tab', { name: label, exact: true }).click()
					expect(await transport.getByRole('tabpanel').count()).toBe(1)
					expect(await transport.getByRole('tabpanel').textContent()).toContain(
						'Hello UltimaBase',
					)
					expect((await transport.boundingBox())?.height).toBe(height)
					await page
						.locator('.ub-composition-tabs')
						.getByRole('tab', { name: label, exact: true })
						.click()
					const configuration = await page
						.locator('.ub-composition-tabs')
						.getByRole('tabpanel')
						.textContent()
					// Each complete preset remains readable without a nested vertical scrollbar.
					expect(
						await page
							.locator('.ub-composition-tabs')
							.getByRole('region')
							.evaluate(
								(element) => element.scrollHeight <= element.clientHeight + 1,
							),
					).toBe(true)
					expect(configuration).toContain('postgresPlugin')
					if (label !== 'TypeScript') {
						expect(configuration).toContain('httpPlugin')
						expect(configuration).toContain('honoServerPlugin')
					}
					expect(
						await page.locator('.ub-composition-tabs pre').textContent(),
					).toBe(
						compositionExamples.find((example) => example.label === label)
							?.code,
					)
					expect(
						await page
							.locator('.ub-landing')
							.getByRole('button', { name: 'Copy Text', exact: true })
							.count(),
					).toBe(0)
					if (label === 'GraphQL')
						expect(configuration).toContain('graphqlYogaPlugin')
				}
				const faq = page.locator('.ub-faq')
				expect(await faq.locator('summary').count()).toBe(6)
				expect(await faq.locator('details[open]').count()).toBe(1)
				expect(
					await faq.locator('details').first().getAttribute('open'),
				).not.toBeNull()
				for (const summary of await faq.locator('summary').all()) {
					const wasOpen =
						(await summary.locator('..').getAttribute('open')) !== null
					await summary.focus()
					await page.keyboard.press('Enter')
					expect(
						(await summary.locator('..').getAttribute('open')) !== null,
					).toBe(!wasOpen)
				}
				// Core/plugin ownership stays visible on mobile as well as desktop.
				for (const label of await page
					.locator('.ub-capabilities .ub-demo-eyebrow')
					.all()) {
					expect(await label.isVisible()).toBe(true)
				}
				// Readers comparing features can jump directly to each visible capability group.
				const navigation = page.getByRole('navigation', {
					name: 'Explore product capabilities',
				})
				for (const link of await navigation.getByRole('link').all()) {
					const target = await link.getAttribute('href')
					if (!target) throw new Error('Missing capability anchor')
					await link.click()
					await page.waitForURL(`${harness.origin}/${target}`)
					const bounds = await page.locator(target).boundingBox()
					expect(bounds?.y).toBeGreaterThanOrEqual(56)
					expect(bounds?.y).toBeLessThan(140)
				}
				expect(await page.locator('.ub-computed-proof pre').textContent()).toBe(
					virtualFieldExample,
				)
				expect(await accessibilityViolations(page)).toEqual([])
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth),
				).toBe(width)
				// The explicitly excluded onboarding change must not slip into this pass.
				expect(
					await page
						.getByRole('link', { name: 'Start building', exact: true })
						.getAttribute('href'),
				).toBe('/docs/1.0.0/manual-installation')
			} finally {
				await context.close()
			}
		},
	)

	it('serves a real share image and preserves preview indexing policy', async () => {
		const page = await browser?.newPage()
		if (!page || !harness) throw new Error('Browser did not start')
		try {
			await page.goto(harness.origin)
			expect(await page.title()).toBe(
				'UltimaBase — TypeScript backend framework',
			)
			expect(
				await page.locator('meta[property="og:title"]').getAttribute('content'),
			).toBe('UltimaBase — TypeScript backend framework')
			expect(
				await page.locator('meta[name="twitter:card"]').getAttribute('content'),
			).toBe('summary_large_image')
			expect(
				await page.locator('meta[name="robots"]').getAttribute('content'),
			).toContain('noindex')
			const image = await page
				.locator('meta[property="og:image"]')
				.getAttribute('content')
			if (!image) throw new Error('Missing share image')
			const response = await page.request.get(
				new URL(new URL(image).pathname, harness.origin).href,
			)
			expect(response.ok()).toBe(true)
			expect(response.headers()['content-type']).toContain('image/png')
			const png = await response.body()
			expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
			expect(png.readUInt32BE(16)).toBe(1200)
			expect(png.readUInt32BE(20)).toBe(630)
			expect(
				await page
					.locator('meta[name="twitter:image"]')
					.getAttribute('content'),
			).toContain('opengraph-image')
		} finally {
			await page.close()
		}
	})
})
