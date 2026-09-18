import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { demoExamples } from '../components/landing/demo-content'
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

describe('landing demonstrations', () => {
	it.each([375, 1440])(
		'keeps the %i-pixel demo stable and accessible without copy controls',
		async (width) => {
			const context = await browser?.newContext({
				colorScheme: 'dark',
				viewport: { width, height: 900 },
			})
			if (!context || !harness) throw new Error('Browser did not start')
			try {
				const page = await context.newPage()
				await page.goto(harness.origin, { waitUntil: 'networkidle' })
				const proof = page.locator('.ub-proof')
				const initial = await proof.boundingBox()
				if (!initial) throw new Error('Missing demonstration')
				for (const example of demoExamples) {
					await proof
						.getByRole('tab', { name: example.label, exact: true })
						.click()
					const panel = proof.getByRole('tabpanel')
					expect(await panel.count()).toBe(1)
					expect(await panel.locator('dt').allTextContents()).toEqual(
						example.fields.map((field) => field.name),
					)
					const bounds = await proof.boundingBox()
					expect(
						Math.abs((bounds?.height ?? 0) - initial.height),
					).toBeLessThanOrEqual(1)
					expect(await panel.locator('pre').textContent()).toBe(example.code)
					expect(
						await panel
							.getByRole('button', { name: 'Copy Text', exact: true })
							.count(),
					).toBe(0)
				}
				await proof.getByRole('tab', { name: 'Read', exact: true }).click()
				expect(await accessibilityViolations(page)).toEqual([])
				await proof.getByRole('link', { name: 'See the setup' }).click()
				await page.waitForURL(`${harness.origin}/#application-setup`)
				const setup = await page.locator('#application-setup').boundingBox()
				expect(setup?.y).toBeGreaterThanOrEqual(56)
				expect(setup?.y).toBeLessThan(140)
				if (width === 375) {
					await page.setViewportSize({ width: 320, height: 900 })
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth),
					).toBe(320)
				}
			} finally {
				await context.close()
			}
		},
	)

	it('shows both transaction outcomes through native keyboard tabs', async () => {
		const context = await browser?.newContext({
			viewport: { width: 390, height: 844 },
		})
		if (!context || !harness) throw new Error('Browser did not start')
		try {
			const page = await context.newPage()
			await page.goto(harness.origin, { waitUntil: 'networkidle' })
			const transaction = page.locator('.ub-transaction-demo')
			const initial = await transaction.boundingBox()
			await transaction
				.getByRole('tab', { name: 'Commit', exact: true })
				.focus()
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('Enter')
			const rollback = transaction.getByRole('tab', {
				name: 'Rollback',
				exact: true,
			})
			await expect
				.poll(() => rollback.getAttribute('aria-selected'))
				.toBe('true')
			expect(await transaction.getByRole('tabpanel').textContent()).toContain(
				'Neither change saved',
			)
			const changed = await transaction.boundingBox()
			expect(changed?.height).toBe(initial?.height)
			expect(await accessibilityViolations(page)).toEqual([])
		} finally {
			await context.close()
		}
	})
})
