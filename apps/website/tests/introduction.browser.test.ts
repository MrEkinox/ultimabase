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

describe('introduction journey', () => {
	it('shows three icon-bearing pages under the Introduction separator', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/quick-start`)
			const sidebar = page.locator('#nd-sidebar')
			await sidebar.getByText('Introduction', { exact: true }).waitFor()
			const introductionPages = [
				['Quick Start', '/docs/1.0.0/quick-start'],
				['What is UltimaBase', '/docs/1.0.0'],
				['Manual Installation', '/docs/1.0.0/manual-installation'],
			] as const
			for (const [name, href] of introductionPages) {
				const link = sidebar.getByRole('link', { name, exact: true })
				expect(await link.getAttribute('href')).toBe(href)
				expect(await link.locator('svg').count()).toBe(1)
			}
			expect(
				await page.getByText('Automatic setup is not yet available').count(),
			).toBe(1)
		} finally {
			await context.close()
		}
	})
})
