import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
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

describe('single application page', () => {
	it('keeps the application concept focused and links to the testing guide', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/core/application`)
			await page
				.getByRole('heading', { level: 1, name: 'Application' })
				.waitFor()
			const sidebar = page.locator('#nd-sidebar')
			expect(
				await sidebar
					.getByRole('link', { name: 'Application', exact: true })
					.count(),
			).toBe(1)
			expect(
				await sidebar
					.getByRole('button', { name: 'Application', exact: true })
					.count(),
			).toBe(0)
			for (const heading of [
				'Application graph',
				'Start and dispose',
				'Application boundaries',
				'Next steps',
			]) {
				await page.getByRole('heading', { level: 2, name: heading }).waitFor()
			}
			expect(
				await page.getByRole('heading', { name: 'Optional Typegen' }).count(),
			).toBe(0)
			await page.goto(`${origin}/docs/1.0.0/manual-installation`)
			await page
				.locator('a[data-card][href="/docs/1.0.0/guides/test-an-application"]')
				.click()
			await page.waitForURL(`${origin}/docs/1.0.0/guides/test-an-application`)
			await page
				.getByRole('heading', { level: 1, name: 'Test an Application' })
				.waitFor()
			// ADR-0297 removed Typegen and its generation guide.
			const removedGuide = await page.request.get(
				`${origin}/docs/1.0.0/guides/generate-types`,
				{ maxRedirects: 0 },
			)
			expect(removedGuide.status()).toBe(404)
		} finally {
			await context.close()
		}
	})

	it('does not publish the five former child routes', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			for (const slug of [
				'application-graph',
				'direct-typescript',
				'lifecycle',
				'request-context',
				'typegen',
			]) {
				const response = await page.request.get(
					`${origin}/docs/1.0.0/core/application/${slug}`,
					{ maxRedirects: 0 },
				)
				expect(response.status(), slug).toBe(404)
			}
		} finally {
			await context.close()
		}
	})

	it('renders the application graph as an accessible, mobile-contained diagram', async () => {
		const context = await browser?.newContext({
			colorScheme: 'dark',
			viewport: { height: 812, width: 375 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/core/application`)
			const diagram = page.getByRole('img', {
				name: /Schemas, plugins, and options pass validation/u,
			})
			await diagram.waitFor({ state: 'visible' })
			expect(await diagram.locator('svg').count()).toBe(1)
			expect(await diagram.innerHTML()).not.toContain('fonts.googleapis.com')
			expect(await diagram.textContent()).toContain(
				'Immutable compiled application graph',
			)
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true)
		} finally {
			await context.close()
		}
	})
})
