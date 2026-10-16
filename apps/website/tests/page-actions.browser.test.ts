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
			pagePath: '/docs/1.0.0/manual-installation',
			sourcePath: 'apps/website/content/docs/1.0.0/manual-installation.mdx',
			title: 'Manual Installation',
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

	it('publishes a navigable index and readable full documentation for AI readers', async () => {
		const context = await browser?.newContext()
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			const indexResponse = await page.request.get(`${origin}/llms.txt`)
			expect(indexResponse.status()).toBe(200)
			expect(indexResponse.headers()['content-type']).toContain('text/plain')
			const index = await indexResponse.text()
			expect(index).toContain('# UltimaBase documentation')
			expect(index).toContain('## Documentation index')
			expect(index).toContain(
				'[Read the complete documentation](/llms-full.txt)',
			)
			expect(index).toContain(
				'[Manual Installation](/docs/1.0.0/manual-installation)',
			)
			expect(index).toContain(
				'[Release Status](/docs/1.0.0/project/release-status)',
			)
			expect(index).toContain('[Roadmap](/docs/1.0.0/project/roadmap)')

			const roadmapResponse = await page.request.get(
				`${origin}/docs/1.0.0/project/roadmap.md`,
			)
			expect(roadmapResponse.status()).toBe(200)
			expect(await roadmapResponse.text()).toContain(
				'[File fields](https://github.com/MrEkinox/ultimadatabase/blob/main/ROADMAP.md#file-fields)',
			)

			const fullResponse = await page.request.get(`${origin}/llms-full.txt`)
			expect(fullResponse.status()).toBe(200)
			expect(fullResponse.headers()['content-type']).toContain('text/plain')
			const full = await fullResponse.text()
			expect(full).toContain(
				'# Manual Installation (/docs/1.0.0/manual-installation)',
			)
			expect(full).toContain('**npm**\n\n```bash\nmkdir ultimabase-first-app')
			expect(full).toContain('- src/\n  - app.ts\n  - schemas/\n    - task.ts')
			expect(full).toContain(
				'[File fields](https://github.com/MrEkinox/ultimadatabase/blob/main/ROADMAP.md#file-fields)',
			)
			expect(full).toContain('```mermaid\nflowchart')
			expect(full).not.toContain('\0')
			expect(full).not.toMatch(/<(?:Callout|Cards|CodeBlockTabs|Mermaid)\b/u)
		} finally {
			await context.close()
		}
	})
})
