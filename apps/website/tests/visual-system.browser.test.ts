import AxeBuilder from '@axe-core/playwright'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { minimalExampleUrl } from '../components/landing/content'
import { siteConfig } from '../lib/site'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const nextBinary = path.join(repositoryRoot, 'node_modules/next/dist/bin/next')

let browser: Browser | undefined
let origin = ''
let websiteProcess: ChildProcessWithoutNullStreams | undefined
let websiteOutput = ''

const availablePort = async (): Promise<number> =>
	new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (address === null || typeof address === 'string') {
				server.close()
				reject(new TypeError('Website test server did not receive a TCP port'))
				return
			}
			server.close((error) => {
				if (error === undefined) resolve(address.port)
				else reject(error)
			})
		})
	})

const waitForWebsite = async (): Promise<void> => {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (websiteProcess !== undefined && websiteProcess.exitCode !== null) {
			throw new Error(`Website exited before readiness:\n${websiteOutput}`)
		}

		try {
			const response = await fetch(origin)
			if (response.ok) return
		} catch {
			// The production server may still be binding its listener.
		}

		await new Promise((resolve) => setTimeout(resolve, 100))
	}

	throw new Error(`Website did not become ready:\n${websiteOutput}`)
}

const stopWebsite = async (): Promise<void> => {
	const childProcess = websiteProcess
	if (childProcess === undefined) return
	if (childProcess.exitCode !== null) return

	await new Promise<void>((resolve) => {
		const forceStop = setTimeout(() => {
			childProcess.kill('SIGKILL')
			resolve()
		}, 5_000)
		forceStop.unref()
		childProcess.once('exit', () => {
			clearTimeout(forceStop)
			resolve()
		})
		childProcess.kill('SIGTERM')
	})
}

const accessibilityViolations = async (page: Page) => {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze()

	return results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		targets: violation.nodes.flatMap((node) => node.target),
	}))
}

beforeAll(async () => {
	const port = await availablePort()
	origin = `http://127.0.0.1:${String(port)}`
	websiteProcess = spawn(
		process.execPath,
		[nextBinary, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
		{
			cwd: websiteRoot,
			env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
			stdio: 'pipe',
		},
	)
	websiteProcess.stdout.setEncoding('utf8')
	websiteProcess.stderr.setEncoding('utf8')
	websiteProcess.stdout.on('data', (value: string) => {
		websiteOutput += value
	})
	websiteProcess.stderr.on('data', (value: string) => {
		websiteOutput += value
	})

	await waitForWebsite()
	browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
	await browser?.close()
	await stopWebsite()
})

describe('website visual system', () => {
	it.each([
		{ colorScheme: 'light' as const, path: '/', width: 1280 },
		{ colorScheme: 'dark' as const, path: '/docs', width: 375 },
	])(
		'keeps the $colorScheme $path shell accessible',
		async ({ colorScheme, path, width }) => {
			const context = await browser?.newContext({
				colorScheme,
				viewport: { height: 900, width },
			})
			if (context === undefined) throw new Error('Browser did not start')

			try {
				const page = await context.newPage()
				await page.goto(`${origin}${path}`)
				await expect
					.poll(() =>
						page.evaluate(() =>
							document.documentElement.classList.contains('dark'),
						),
					)
					.toBe(colorScheme === 'dark')
				const header = page.locator(path === '/' ? '#nd-nav' : '#nd-subnav')
				await header.waitFor({ state: 'visible' })
				await header.locator('[data-brand]').waitFor({ state: 'visible' })
				await page.locator('[data-site-footer]').waitFor({ state: 'visible' })

				await page.keyboard.press('Tab')
				const focusOutlineWidth = await page.evaluate(() => {
					const activeElement = document.activeElement
					if (!(activeElement instanceof HTMLElement)) return 0
					return Number.parseFloat(getComputedStyle(activeElement).outlineWidth)
				})
				expect(focusOutlineWidth).toBeGreaterThanOrEqual(3)
				expect(await accessibilityViolations(page)).toEqual([])
			} finally {
				await context.close()
			}
		},
	)

	it('remains readable on narrow and 200% zoom-equivalent layouts', async () => {
		const context = await browser?.newContext({
			viewport: { height: 812, width: 375 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(origin)
			await page
				.getByRole('heading', { level: 1 })
				.waitFor({ state: 'visible' })
			await page
				.getByRole('link', { name: 'Start building' })
				.waitFor({ state: 'visible' })
			await page
				.getByRole('figure', { name: 'Three entry points. One Runtime.' })
				.waitFor({ state: 'attached' })
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true)

			// A 320 CSS-pixel viewport represents a 640-pixel window at 200% zoom.
			await page.setViewportSize({ height: 720, width: 320 })
			await page
				.getByRole('heading', { level: 1 })
				.waitFor({ state: 'visible' })
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true)
		} finally {
			await context.close()
		}
	})

	it('connects navigation, calls to action, and theme without client errors', async () => {
		const context = await browser?.newContext({
			colorScheme: 'light',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const clientErrors: string[] = []
			const page = await context.newPage()
			page.on('console', (message) => {
				if (message.type() === 'error') clientErrors.push(message.text())
			})
			page.on('pageerror', (error) => {
				clientErrors.push(error.message)
			})

			await page.goto(origin)
			await page
				.getByRole('heading', {
					level: 1,
					name: 'Define your data once. Keep every API honest.',
				})
				.waitFor({ state: 'visible' })

			expect(
				await page
					.locator('#nd-nav')
					.getByRole('link', { name: 'Docs' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.docs)
			expect(
				await page
					.getByRole('link', { name: 'Start building' })
					.getAttribute('href'),
			).toBe(siteConfig.routes.gettingStarted)
			expect(
				await page
					.getByRole('link', { name: 'View on GitHub' })
					.getAttribute('href'),
			).toBe(siteConfig.repositoryUrl.href)
			expect(
				await page
					.getByRole('link', { name: 'Inspect the runnable example' })
					.getAttribute('href'),
			).toBe(minimalExampleUrl)

			const root = page.locator('html')
			expect((await root.getAttribute('class')) ?? '').not.toContain('dark')
			await page.getByRole('button', { name: 'Toggle Theme' }).click()
			await expect
				.poll(async () => (await root.getAttribute('class'))?.includes('dark'))
				.toBe(true)
			expect(clientErrors).toEqual([])
		} finally {
			await context.close()
		}
	})

	it('removes decorative motion when reduced motion is requested', async () => {
		const context = await browser?.newContext({
			reducedMotion: 'reduce',
			viewport: { height: 900, width: 1280 },
		})
		if (context === undefined) throw new Error('Browser did not start')

		try {
			const page = await context.newPage()
			await page.goto(origin)
			const surface = page.getByTestId('visual-system-motion')
			await surface.hover()
			const motion = await surface.evaluate((element) => {
				const style = getComputedStyle(element)
				return {
					transform: style.transform,
					transitionDuration: style.transitionDuration,
				}
			})

			expect(motion.transform).toBe('none')
			expect(
				motion.transitionDuration
					.split(', ')
					.every((duration) => Number.parseFloat(duration) <= 0.000_01),
			).toBe(true)
		} finally {
			await context.close()
		}
	})
})
