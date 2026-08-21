import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const historicalRoots = ['docs/adr', 'docs/plans', 'issues'] as const
const activeRoots = [
	'README.md',
	'ARCHITECTURE.md',
	'docs/concepts',
	'packages',
	'examples',
	'apps',
	'tooling',
	'tests',
] as const

const collectMarkdown = (relativePath: string): readonly string[] => {
	const absolutePath = path.join(repositoryRoot, relativePath)
	if (!fs.existsSync(absolutePath)) return []
	const stat = fs.statSync(absolutePath)
	if (stat.isFile()) return relativePath.endsWith('.md') ? [relativePath] : []

	return fs
		.readdirSync(absolutePath, { withFileTypes: true })
		.flatMap((entry) => {
			if (entry.name === 'dist' || entry.name === 'node_modules') return []
			return collectMarkdown(path.join(relativePath, entry.name))
		})
}

const activeDocuments = activeRoots.flatMap(collectMarkdown)
const readDocument = (relativePath: string): string =>
	fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

const workspacePackageNames = new Set(
	fs
		.readdirSync(path.join(repositoryRoot, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) =>
			path.join(repositoryRoot, 'packages', entry.name, 'package.json'),
		)
		.filter((packageJson) => fs.existsSync(packageJson))
		.map((packageJson) => {
			const parsed: unknown = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
			if (
				typeof parsed !== 'object' ||
				parsed === null ||
				!('name' in parsed) ||
				typeof parsed.name !== 'string'
			) {
				throw new TypeError(`${packageJson} must declare a package name`)
			}
			return parsed.name
		}),
)

const codeFences = (contents: string): readonly string[] =>
	[...contents.matchAll(/```(?:ts|tsx|js|javascript)\n([\s\S]*?)```/gu)].map(
		(match) => match[1] ?? '',
	)

describe('active documentation contracts', () => {
	it('classifies historical records outside the active contract', () => {
		for (const historicalRoot of historicalRoots) {
			expect(
				activeDocuments.some(
					(document) =>
						document === historicalRoot ||
						document.startsWith(`${historicalRoot}${path.sep}`),
				),
			).toBe(false)
		}
	})

	it('contains no removed optional-product authoring paths', () => {
		const removedContracts = [
			/@ultimabase\/(?:hooks|access)-contracts/gu,
			/schemas\.defineOption\(/gu,
			/typegen\.contribute\(/gu,
			/\b(?:globalBeforeHooks|schemaBeforeHooks|schemaAfterHooks|globalAfterHooks|nativeHooks)\b/gu,
			/\bnative (?:schema|field|item) (?:Hooks?|Access)\b/giu,
		] as const
		const violations: string[] = []

		for (const document of activeDocuments) {
			const contents = readDocument(document)
			for (const contract of removedContracts) {
				contract.lastIndex = 0
				if (contract.test(contents)) {
					violations.push(`${document}: ${String(contract)}`)
				}
			}
		}

		expect(violations).toEqual([])
	})

	it('installs the owner of every Hooks or Access schema option example', () => {
		const violations: string[] = []

		for (const document of activeDocuments) {
			for (const fence of codeFences(readDocument(document))) {
				if (/^\s*hooks\s*:/mu.test(fence)) {
					if (
						!fence.includes("from '@ultimabase/hooks-plugin'") ||
						!fence.includes('hooksPlugin()')
					) {
						violations.push(`${document}: Hooks option without hooksPlugin()`)
					}
				}
				if (/^\s*access\s*:/mu.test(fence)) {
					if (
						!fence.includes("from '@ultimabase/access-plugin'") ||
						!fence.includes('accessPlugin()')
					) {
						violations.push(`${document}: Access option without accessPlugin()`)
					}
				}
			}
		}

		expect(violations).toEqual([])
	})

	it('resolves relative links and workspace package imports', () => {
		const violations: string[] = []

		for (const document of activeDocuments) {
			const contents = readDocument(document)
			for (const match of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
				const rawTarget = match[1]?.trim()
				if (
					rawTarget === undefined ||
					rawTarget.startsWith('#') ||
					/^(?:https?:|mailto:)/u.test(rawTarget)
				) {
					continue
				}
				const target = decodeURIComponent(
					rawTarget.replace(/^<|>$/gu, '').split(/[?#]/u)[0] ?? '',
				)
				const resolved = path.resolve(
					repositoryRoot,
					path.dirname(document),
					target,
				)
				if (!fs.existsSync(resolved))
					violations.push(`${document}: ${rawTarget}`)
			}

			for (const fence of codeFences(contents)) {
				for (const match of fence.matchAll(
					/(?:from\s+|import\s+)["'](@ultimabase\/[^"']+)["']/gu,
				)) {
					const packageName = match[1]
					if (
						packageName !== undefined &&
						!workspacePackageNames.has(packageName)
					) {
						violations.push(`${document}: unknown package ${packageName}`)
					}
				}
			}
		}

		expect(violations).toEqual([])
	})

	it('keeps important guides backed by executable public examples', () => {
		const backingExamples = {
			'docs/concepts/open-plugin-authoring.md':
				'tests/e2e/fixtures/open-kernel-workflow.ts',
			'packages/access-plugin/README.md':
				'tests/e2e/access-plugin-postgres.postgres.e2e.test.ts',
			'packages/hooks-plugin/README.md':
				'tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts',
			'packages/pg-vector-plugin/README.md':
				'packages/typegen/src/generator-language-service.test.ts',
			'packages/postgres-plugin/README.md':
				'tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts',
		} as const

		for (const [document, example] of Object.entries(backingExamples)) {
			expect(fs.existsSync(path.join(repositoryRoot, example)), example).toBe(
				true,
			)
			expect(readDocument(document), document).toContain(path.basename(example))
		}
	})
})
