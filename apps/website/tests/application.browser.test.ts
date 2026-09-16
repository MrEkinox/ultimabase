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
	it('keeps every application subject on one navigable page', async () => {
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
				'Read and write in TypeScript',
				'Request context and authority',
				'Optional Typegen',
			]) {
				await page.getByRole('heading', { level: 2, name: heading }).waitFor()
			}
			expect(
				await page.locator('a[href="#optional-typegen"]').count(),
			).toBeGreaterThan(0)
			await page.goto(`${origin}/docs/1.0.0/manual-installation`)
			await page
				.locator('a[href="/docs/1.0.0/core/application#optional-typegen"]')
				.click()
			await page.waitForURL(
				`${origin}/docs/1.0.0/core/application#optional-typegen`,
			)
			await page
				.getByRole('heading', { level: 2, name: 'Optional Typegen' })
				.waitFor()
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
})
