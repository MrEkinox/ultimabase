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

describe('documentation sidebar', () => {
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

	it('uses fixed section titles without an extra collapsible level', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/core/application`)
			const sidebar = page.locator('#nd-sidebar')
			for (const title of [
				'Introduction',
				'Core',
				'Plugins',
				'Guides',
				'Operate Your Application',
				'Reference',
			]) {
				expect(await sidebar.getByText(title, { exact: true }).count()).toBe(1)
				expect(
					await sidebar
						.getByRole('button', { name: title, exact: true })
						.count(),
				).toBe(0)
			}
			expect(
				await sidebar
					.getByRole('link', { name: 'Application', exact: true })
					.count(),
			).toBe(1)
			expect(
				await sidebar
					.getByRole('link', { name: 'Plugin System' })
					.getAttribute('href'),
			).toBe('/docs/1.0.0/plugins/overview')
			expect(
				await sidebar
					.getByRole('link', { name: 'Build an Authenticated API' })
					.getAttribute('href'),
			).toBe('/docs/1.0.0/guides/build-an-authenticated-api')
		} finally {
			await context.close()
		}
	})

	it('places virtual fields in Data Modeling without a duplicate guide route', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/core/data-modeling/virtual-fields`)
			await page
				.getByRole('heading', { level: 1, name: 'Virtual Fields' })
				.waitFor()
			const sidebar = page.locator('#nd-sidebar')
			expect(
				await sidebar
					.getByRole('link', { name: 'Virtual Fields' })
					.getAttribute('href'),
			).toBe('/docs/1.0.0/core/data-modeling/virtual-fields')
			const oldGuide = await page.request.get(
				`${origin}/docs/1.0.0/guides/add-virtual-fields`,
				{ maxRedirects: 0 },
			)
			expect(oldGuide.status()).toBe(404)
		} finally {
			await context.close()
		}
	})

	it('keeps field builders in Fields and removes the duplicate reference route', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/core/data-modeling/fields`)
			await page
				.getByRole('heading', { level: 2, name: 'Built-in field builders' })
				.waitFor()
			expect(
				await page.locator('a[href="#built-in-field-builders"]').count(),
			).toBeGreaterThan(0)
			const sidebar = page.locator('#nd-sidebar')
			expect(
				await sidebar
					.getByRole('link', { name: 'Fields', exact: true })
					.count(),
			).toBe(1)
			expect(
				await sidebar.getByRole('link', { name: 'Field Builders' }).count(),
			).toBe(0)
			const oldReference = await page.request.get(
				`${origin}/docs/1.0.0/reference/core-api/fields`,
				{ maxRedirects: 0 },
			)
			expect(oldReference.status()).toBe(404)
		} finally {
			await context.close()
		}
	})

	it('keeps schema options in Schemas and removes the duplicate reference route', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(`${origin}/docs/1.0.0/core/data-modeling/schemas`)
			await page
				.getByRole('heading', { level: 2, name: 'Declaration options' })
				.waitFor()
			expect(
				await page.locator('a[href="#declaration-options"]').count(),
			).toBeGreaterThan(0)
			const sidebar = page.locator('#nd-sidebar')
			expect(
				await sidebar
					.getByRole('link', { name: 'Schemas', exact: true })
					.count(),
			).toBe(1)
			const oldReference = await page.request.get(
				`${origin}/docs/1.0.0/reference/core-api/schema`,
				{ maxRedirects: 0 },
			)
			expect(oldReference.status()).toBe(404)
		} finally {
			await context.close()
		}
	})
})
