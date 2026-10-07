import AxeBuilder from '@axe-core/playwright'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const nextBinary = path.join(repositoryRoot, 'node_modules/next/dist/bin/next')

export interface WebsiteBrowserHarness {
	readonly browser: Browser
	readonly origin: string
	close(): Promise<void>
}

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

const stopProcess = async (
	websiteProcess: ChildProcessWithoutNullStreams,
): Promise<void> => {
	if (websiteProcess.exitCode !== null) return

	await new Promise<void>((resolve) => {
		const forceStop = setTimeout(() => {
			websiteProcess.kill('SIGKILL')
			resolve()
		}, 5_000)
		forceStop.unref()
		websiteProcess.once('exit', () => {
			clearTimeout(forceStop)
			resolve()
		})
		websiteProcess.kill('SIGTERM')
	})
}

export async function startWebsiteBrowserHarness(): Promise<WebsiteBrowserHarness> {
	const port = await availablePort()
	const origin = `http://127.0.0.1:${String(port)}`
	let websiteOutput = ''
	const websiteProcess = spawn(
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

	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (websiteProcess.exitCode !== null) {
			throw new Error(`Website exited before readiness:\n${websiteOutput}`)
		}
		try {
			const response = await fetch(origin)
			if (response.ok) break
		} catch {
			// The production server may still be binding its listener.
		}
		if (attempt === 99) {
			await stopProcess(websiteProcess)
			throw new Error(`Website did not become ready:\n${websiteOutput}`)
		}
		await new Promise((resolve) => setTimeout(resolve, 100))
	}

	const browser = await chromium.launch({ headless: true })
	return {
		browser,
		origin,
		async close() {
			await browser.close()
			await stopProcess(websiteProcess)
		},
	}
}

export const accessibilityViolations = async (page: Page) => {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze()

	return results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		targets: violation.nodes.flatMap((node) => node.target),
	}))
}

export function collectClientErrors(page: Page): string[] {
	const errors: string[] = []
	page.on('console', (message) => {
		if (message.type() === 'error') {
			errors.push(`${page.url()}: ${message.text()}`)
		}
	})
	page.on('pageerror', (error) => {
		errors.push(`${page.url()}: ${error.message}`)
	})
	return errors
}
