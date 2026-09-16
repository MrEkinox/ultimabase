import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const docsRoot = path.join(websiteRoot, 'content/docs/1.0.0')
const pagePaths = [
	'plugins/official/http-and-apis/http',
	'plugins/official/data-and-persistence/postgresql',
	'operations/application-troubleshooting',
] as const

const readPage = async (
	pagePath: (typeof pagePaths)[number],
): Promise<string> => readFile(path.join(docsRoot, `${pagePath}.mdx`), 'utf8')

const collectMdxFiles = async (
	directory: string,
): Promise<readonly string[]> => {
	const entries = await readdir(directory, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name)
			return entry.isDirectory()
				? collectMdxFiles(entryPath)
				: Promise.resolve(entry.name.endsWith('.mdx') ? [entryPath] : [])
		}),
	)
	return nested.flat()
}

const pageUrl = (filePath: string): string => {
	const relative = path.relative(docsRoot, filePath).replaceAll(path.sep, '/')
	const slug = relative.replace(/\.mdx$/u, '').replace(/\/index$/u, '')
	return slug === 'index' ? '/docs/1.0.0' : `/docs/1.0.0/${slug}`
}

describe('troubleshooting content', () => {
	it('keeps troubleshooting beside the subject it diagnoses', async () => {
		const [http, postgres, application] = await Promise.all(
			pagePaths.map(readPage),
		)
		expect(http).toContain('## Troubleshooting')
		expect(postgres).toContain('## Troubleshooting')
		expect(application).toContain('## Startup and plugin graph')
		expect(application).toContain('## Typegen')
		expect(application).toContain('## Report a problem')
		for (const source of [http, postgres, application]) {
			expect(source).toMatch(/^releaseStatus: pre-release$/mu)
		}
	})

	it('keeps diagnostic instructions safe', async () => {
		const source = (await Promise.all(pagePaths.map(readPage))).join('\n')
		for (const unsafe of [
			'NODE_TLS_REJECT_UNAUTHORIZED=0',
			'console.log(process.env)',
			'printenv',
			'set -x',
			'useMasterKey: true',
			'skipHooks',
		]) {
			expect(source).not.toContain(unsafe)
		}
		expect(source).toContain('node --version')
		expect(source).toContain('yarn --version')
		expect(source).toContain('Host permissions and path casing vary')
	})

	it('keeps internal troubleshooting links valid and connected to errors', async () => {
		const files = await collectMdxFiles(docsRoot)
		const urls = new Set(files.map(pageUrl))

		for (const pagePath of pagePaths) {
			const currentUrl = `/docs/1.0.0/${pagePath}`
			const source = await readPage(pagePath)
			const links = [...source.matchAll(/\[[^\]]+\]\((?<href>[^)]+)\)/gu)]
				.map((match) => match.groups?.href)
				.filter(
					(href): href is string =>
						href !== undefined &&
						!href.startsWith('http://') &&
						!href.startsWith('https://'),
				)
			for (const href of links) {
				const pathOnly = href.split('#')[0] ?? href
				const resolved = pathOnly.startsWith('/')
					? pathOnly
					: path.posix.normalize(
							path.posix.join(path.posix.dirname(currentUrl), pathOnly),
						)
				expect(urls, `${pagePath}: ${href}`).toContain(resolved)
			}
		}

		const errors = await readFile(
			path.join(docsRoot, 'core/runtime/api-errors.mdx'),
			'utf8',
		)
		expect(errors).toContain(
			'/docs/1.0.0/operations/application-troubleshooting',
		)
		expect(errors).toContain('/docs/1.0.0/plugins/official/http-and-apis/http')
	})

	it('requires a reproducible and sanitized report', async () => {
		const report = await readPage('operations/application-troubleshooting')
		for (const field of [
			'### Versions',
			'### Minimal reproduction',
			'### Expected behavior',
			'### Actual behavior',
		]) {
			expect(report).toContain(field)
		}
		for (const secret of [
			'database URLs',
			'cookies',
			'tokens',
			'Master material',
		]) {
			expect(report).toContain(secret)
		}
	})
})
