import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
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
		{ height: 900, width: 1440 },
		{ height: 812, width: 375 },
	])(
		'shows a useful application result in the first $width-pixel view',
		async (viewport) => {
			const context = await browser?.newContext({ viewport })
			if (context === undefined || harness === undefined) {
				throw new Error('Browser did not start')
			}

			try {
				const page = await context.newPage()
				await page.goto(harness.origin)
				const output = page.locator('.ub-proof-output')
				await output.waitFor({ state: 'visible' })
				const outputTop = await output.evaluate(
					(element) => element.getBoundingClientRect().top,
				)
				expect(outputTop).toBeLessThan(viewport.height)
				expect(await output.getByText('Article.findMany').count()).toBe(1)
			} finally {
				await context.close()
			}
		},
	)

	it('does not vertically clip the complete application example', async () => {
		const context = await browser?.newContext({
			viewport: { height: 900, width: 1440 },
		})
		if (context === undefined || harness === undefined) {
			throw new Error('Browser did not start')
		}

		try {
			const page = await context.newPage()
			await page.goto(harness.origin)
			const code = page.locator('.ub-application-code [role="region"]')
			await code.waitFor({ state: 'visible' })
			const isClipped = await code.evaluate(
				(element) => element.scrollHeight > element.clientHeight + 1,
			)
			expect(isClipped).toBe(false)
		} finally {
			await context.close()
		}
	})
})
