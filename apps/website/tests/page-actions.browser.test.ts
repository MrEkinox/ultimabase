import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

describe('documentation page actions', () => {
	it.each([
		{
			pagePath: '/docs/1.0.0',
			sourcePath: 'apps/website/content/docs/1.0.0/index.mdx',
			title: 'What is UltimaBase',
		},
		{
			pagePath: '/docs/1.0.0/getting-started/installation',
			sourcePath:
				'apps/website/content/docs/1.0.0/getting-started/installation.mdx',
			title: 'Installation',
		},
	])(
		'serves and copies Markdown for $pagePath',
		async ({ pagePath, sourcePath, title }) => {
			const context = await browser?.newContext({
				permissions: ['clipboard-read', 'clipboard-write'],
			})
			if (context === undefined) throw new Error('Browser did not start')

			try {
				const page = await context.newPage()
				const clientErrors = collectClientErrors(page)
				await page.goto(`${origin}${pagePath}`)

				const markdownUrl = `${pagePath}.md`
				const response = await page.request.get(`${origin}${markdownUrl}`)
				expect(response.status()).toBe(200)
				expect(response.headers()['content-type']).toContain('text/markdown')
				const markdown = await response.text()
				expect(markdown).toContain(`# ${title} (${pagePath})`)
				expect(markdown).not.toContain('---\ntitle:')

				await page.getByRole('button', { name: 'Copy Markdown' }).click()
				await expect
					.poll(() => page.evaluate(() => navigator.clipboard.readText()))
					.toBe(markdown)

				await page.getByRole('button', { exact: true, name: 'Open' }).click()
				expect(
					await page
						.getByRole('link', { name: 'View as Markdown' })
						.getAttribute('href'),
				).toBe(markdownUrl)
				expect(
					await page
						.getByRole('link', { name: 'Open in GitHub' })
						.getAttribute('href'),
				).toBe(
					`https://github.com/MrEkinox/ultimadatabase/blob/main/${sourcePath}`,
				)
				for (const destination of [
					'Open in Scira AI',
					'Open in ChatGPT',
					'Open in Claude',
					'Open in Cursor',
				]) {
					expect(
						await page.getByRole('link', { name: destination }).count(),
					).toBe(1)
				}
				expect(await accessibilityViolations(page)).toEqual([])
				expect(clientErrors).toEqual([])
			} finally {
				await context.close()
			}
		},
	)

	it('does not serve unrecognized Markdown paths', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const response = await page.request.get(
				`${origin}/docs/1.0.0/not-a-page.md`,
			)
			expect(response.status()).toBe(404)
		} finally {
			await context.close()
		}
	})
})
