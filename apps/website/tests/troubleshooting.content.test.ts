import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { frameworkErrorCodes } from '@ultimabase/core'
import { httpPreDispatchErrorCodes } from '@ultimabase/http-plugin'
import { passwordAuthErrorCodes } from '@ultimabase/password-auth-plugin'
import { SchemaTypegenError } from '@ultimabase/typegen'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = path.resolve(websiteRoot, '../..')
const docsRoot = path.join(websiteRoot, 'content/docs/en')
const troubleshootingRoot = path.join(docsRoot, 'troubleshooting')

const pageNames = [
	'http-and-application-identity',
	'postgres',
	'reporting-a-problem',
	'startup',
	'typegen',
] as const

const readPage = async (name: (typeof pageNames)[number]): Promise<string> =>
	readFile(path.join(troubleshootingRoot, `${name}.mdx`), 'utf8')

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
	return slug === 'index' ? '/docs' : `/docs/${slug}`
}

describe('troubleshooting content', () => {
	it('keeps every entry symptom-first and gives one safe escalation path', async () => {
		for (const name of pageNames) {
			const source = await readPage(name)
			for (const heading of [
				'## Symptom',
				'## Cause',
				'## Confirm',
				'## Resolve',
				'## Escalate',
			]) {
				expect(source, `${name}: ${heading}`).toContain(heading)
			}
			expect(source).toMatch(/^contentType: troubleshooting$/mu)
			expect(source).toMatch(/^releaseStatus: pre-release$/mu)
		}
	})

	it('uses the exact public diagnostic identities', async () => {
		const startup = await readPage('startup')
		for (const code of [
			'PLUGIN_DEPENDENCY_MISSING',
			'PLUGIN_CAPABILITY_CONFLICT',
			'PLUGIN_PRIVILEGE_DENIED',
		] as const) {
			expect(frameworkErrorCodes).toContain(code)
			expect(startup).toContain(`\`${code}\``)
		}

		const http = await readPage('http-and-application-identity')
		for (const code of Object.values(httpPreDispatchErrorCodes)) {
			expect(http).toContain(`\`${code}\``)
		}
		for (const code of Object.values(passwordAuthErrorCodes)) {
			expect(http).toContain(`\`${code}\``)
		}

		const typegen = await readPage('typegen')
		const error = new SchemaTypegenError(
			'invalid-application-export',
			'fixture',
		)
		expect(error.code).toBe('SCHEMA_TYPEGEN_FAILED')
		expect(typegen).toContain(`\`${error.code}\``)
		expect(typegen).toContain(`\`${error.reason}\``)
	})

	it('keeps diagnostic commands executable without exposing environment values', async () => {
		expect(
			execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }),
		).toMatch(/^v\d+/u)
		expect(
			execFileSync('yarn', ['--version'], {
				cwd: repositoryRoot,
				encoding: 'utf8',
			}),
		).toMatch(/^\d+\.\d+\.\d+/u)

		const allPages = await Promise.all(pageNames.map(readPage))
		const source = allPages.join('\n')
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
		expect(source).toContain('Host-specific filesystem failures')
	})

	it('keeps internal troubleshooting links valid and connected to error identity', async () => {
		const files = await collectMdxFiles(docsRoot)
		const urls = new Set(files.map(pageUrl))

		for (const name of pageNames) {
			const currentUrl = `/docs/troubleshooting/${name}`
			const source = await readPage(name)
			const links = [...source.matchAll(/\[[^\]]+\]\((?<href>[^)]+)\)/gu)]
				.map((match) => match.groups?.href)
				.filter(
					(href): href is string =>
						href !== undefined &&
						!href.startsWith('http://') &&
						!href.startsWith('https://'),
				)
			for (const href of links) {
				const resolved = path.posix.normalize(
					path.posix.join(path.posix.dirname(currentUrl), href),
				)
				expect(urls, `${name}: ${href}`).toContain(resolved)
			}
			if (name !== 'reporting-a-problem') {
				expect(source).toContain('./reporting-a-problem')
			}
		}

		const errors = await readFile(
			path.join(docsRoot, 'reference/errors.mdx'),
			'utf8',
		)
		expect(errors).toContain('../troubleshooting/startup')
		expect(errors).toContain('../troubleshooting/http-and-application-identity')
	})

	it('requires a reproducible and sanitized report', async () => {
		const report = await readPage('reporting-a-problem')
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
