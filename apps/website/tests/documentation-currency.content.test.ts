import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	documentationEditOptions,
	documentationEditUrl,
	documentationSourcePath,
} from '../lib/docs-links'
import { documentationSections } from '../lib/docs-navigation'
import { validateDocumentationOwnership } from '../lib/documentation-ownership'
import {
	documentationProseDiagnostics,
	parseDocumentationLintExceptions,
} from '../lib/documentation-prose'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const websiteRoot = path.join(repositoryRoot, 'apps/website')
const contentRoot = path.join(websiteRoot, 'content/docs')

const readJson = async (filePath: string): Promise<unknown> =>
	JSON.parse(await readFile(filePath, 'utf8')) as unknown

async function findMdxFiles(directory: string): Promise<readonly string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name)
			if (entry.isDirectory()) return findMdxFiles(entryPath)
			return entry.name.endsWith('.mdx') ? [entryPath] : []
		}),
	)
	return nested.flat()
}

async function publicPackageNames(): Promise<readonly string[]> {
	const packagesRoot = path.join(repositoryRoot, 'packages')
	const directories = await readdir(packagesRoot, { withFileTypes: true })
	const names = await Promise.all(
		directories
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const manifest = await readJson(
					path.join(packagesRoot, entry.name, 'package.json'),
				)
				if (
					typeof manifest !== 'object' ||
					manifest === null ||
					!('name' in manifest) ||
					typeof manifest.name !== 'string'
				) {
					throw new TypeError(`Package ${entry.name} has no valid name`)
				}
				return manifest.name
			}),
	)
	return names.sort()
}

describe('documentation currency guardrails', () => {
	it('keeps one prospective documentation-impact checkpoint', async () => {
		const files = await Promise.all(
			['AGENTS.md', 'CONTRIBUTING.md', '.github/pull_request_template.md'].map(
				(filePath) => readFile(path.join(repositoryRoot, filePath), 'utf8'),
			),
		)
		const classifications = [
			'none',
			'internal engineering documentation',
			'public website documentation',
			'both',
		]

		for (const source of files) {
			const normalizedSource = source.replace(/\s+/gu, ' ')
			for (const classification of classifications) {
				expect(normalizedSource).toContain(classification)
			}
		}
		expect(files[2]?.match(/^- \[ \]/gmu)).toHaveLength(4)
	})

	it('owns every public package exactly once with actionable failures', async () => {
		const ownershipPath = path.join(
			websiteRoot,
			'content/documentation-ownership.json',
		)
		const ownership = await readJson(ownershipPath)
		const packages = await publicPackageNames()
		const sections = [
			...documentationSections.map(({ slug }) => slug),
			'quick-start',
			'manual-installation',
			'project-layout',
		]

		expect(
			validateDocumentationOwnership(ownership, packages, sections),
		).toEqual([])
		const withoutCore = {
			areas: [
				{
					id: 'invalid-missing-core-fixture',
					packages: packages.filter(
						(packageName) => packageName !== '@ultimabase/core',
					),
					sections,
				},
			],
			version: 2,
		}
		expect(
			validateDocumentationOwnership(withoutCore, packages, sections),
		).toContain('Documentation ownership is missing package: @ultimabase/core')
	})

	it('maps every page to its exact source-edit coordinates', () => {
		const pagePath = '1.0.0/index.mdx'
		expect(documentationSourcePath(pagePath)).toBe(
			'apps/website/content/docs/1.0.0/index.mdx',
		)
		expect(documentationEditOptions(pagePath)).toEqual({
			owner: 'MrEkinox',
			path: 'apps/website/content/docs/1.0.0/index.mdx',
			repo: 'ultimadatabase',
			sha: 'main',
		})
		expect(documentationEditUrl(pagePath).href).toBe(
			'https://github.com/MrEkinox/ultimadatabase/blob/main/apps/website/content/docs/1.0.0/index.mdx',
		)
		expect(() => documentationSourcePath('../AGENTS.md')).toThrow(
			'Invalid public documentation source path',
		)
	})

	it('checks review dates, terminology, and headings with exact exceptions', async () => {
		const exceptionInput = await readJson(
			path.join(websiteRoot, 'content/docs-lint-exceptions.json'),
		)
		const exceptions = parseDocumentationLintExceptions(exceptionInput)
		const files = await findMdxFiles(contentRoot)
		const diagnostics: string[] = []

		for (const filePath of files) {
			const source = await readFile(filePath, 'utf8')
			const repositoryPath = path.relative(websiteRoot, filePath)
			if (!/^reviewedAt: \d{4}-\d{2}-\d{2}$/mu.test(source)) {
				diagnostics.push(
					`${repositoryPath}: add a root reviewedAt date after deliberate source review`,
				)
			}
			diagnostics.push(
				...documentationProseDiagnostics(repositoryPath, source, exceptions),
			)
		}

		expect(diagnostics).toEqual([])
	})

	it('reports a common prose mistake with a corrective action', () => {
		const exceptions = parseDocumentationLintExceptions({
			exceptions: [],
			version: 1,
		})
		expect(
			documentationProseDiagnostics(
				'content/docs/example.mdx',
				'---\ntitle: Example\n---\n\n### Install.\n\nUse Typescript.',
				exceptions,
			),
		).toEqual([
			'content/docs/example.mdx: replace “Typescript” with “TypeScript” or add an exact justified lint exception',
			'content/docs/example.mdx: heading “Install.” skips from level 1 to 3',
			'content/docs/example.mdx: remove terminal punctuation from heading “Install.” or add an exact justified lint exception',
		])
	})
})
