import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { selectCi, type Workspace } from './selection.ts'

const workspaces: Workspace[] = [
	{ name: '@ultimabase/core', directory: 'packages/core' },
	{
		name: '@ultimabase/http-plugin',
		directory: 'packages/http-plugin',
	},
	{
		name: '@ultimabase/rest-plugin',
		directory: 'packages/rest-plugin',
	},
	{
		name: '@ultimabase/postgres-plugin',
		directory: 'packages/postgres-plugin',
	},
	{
		name: '@ultimabase/create-app',
		directory: 'packages/create-app',
	},
]
const files = new Map([
	['packages/core/src/core.test.ts', "import './core.js'"],
	['packages/core/src/core.ts', 'export const value = 1'],
	[
		'packages/core/tests/e2e/storage.postgres.e2e.test.ts',
		"import '../../../../tests/fixtures/storage.js'",
	],
	['tests/fixtures/storage.ts', "import '@ultimabase/postgres-plugin'"],
	['packages/http-plugin/src/http.test.ts', "import '@ultimabase/http-plugin'"],
	[
		'packages/rest-plugin/src/rest.test-d.ts',
		"import '@ultimabase/rest-plugin'",
	],
	[
		'packages/postgres-plugin/src/storage.test.ts',
		"import '@ultimabase/postgres-plugin'",
	],
	[
		'packages/create-app/tests/e2e/generated.e2e.test.ts',
		"import '@ultimabase/create-app'",
	],
	['tests/e2e/rest.e2e.test.ts', "import '@ultimabase/rest-plugin'"],
	[
		'tests/e2e/package-archives.e2e.test.ts',
		'/* Dynamically enumerates all archives. */',
	],
	['tests/e2e/independent.e2e.test.ts', "import '@ultimabase/core'"],
])
const select = (changed: string[], full = false) =>
	selectCi({
		files,
		workspaces,
		changed,
		full,
		affected: changed.flatMap((file) => {
			if (file.endsWith('.md')) return []
			const workspace = workspaces.find(({ directory }) =>
				file.startsWith(`${directory}/`),
			)
			return workspace === undefined ? [] : [workspace.name]
		}),
	})

describe('GitHub affected checks', () => {
	it.each([
		'README.md',
		'packages/core/README.md',
		'docs/adr/0250-package-owned-e2e-and-type-tests.md',
		'apps/website/content/docs/guide.mdx',
	])('keeps %s changes out of package tests and coverage', (file) => {
		expect(select([file])).toMatchObject({
			packages: [],
			transversal: [],
			build: false,
			coverage: false,
			documentation: true,
			website: false,
		})
	})
	it('uses Yarn-selected dependants without expanding test-only consumers', () => {
		const plan = selectCi({
			files,
			workspaces,
			changed: ['packages/http-plugin/src/index.ts'],
			affected: ['@ultimabase/http-plugin', '@ultimabase/rest-plugin'],
		})
		expect(plan.packages.map(({ name }) => name)).toEqual([
			'@ultimabase/create-app',
			'@ultimabase/http-plugin',
			'@ultimabase/rest-plugin',
		])
	})
	it('selects a supporting-package E2E without scheduling unrelated Core unit tests', () => {
		const plan = select(['packages/postgres-plugin/src/index.ts'])
		expect(
			plan.packages.find(({ name }) => name === '@ultimabase/core')?.files,
		).toEqual(['packages/core/tests/e2e/storage.postgres.e2e.test.ts'])
		expect(
			plan.packages.some(({ name }) => name === '@ultimabase/rest-plugin'),
		).toBe(false)
		expect(plan.transversal).toEqual(['tests/e2e/package-archives.e2e.test.ts'])
	})
	it('runs only root integrations that consume the affected graph', () => {
		expect(select(['packages/rest-plugin/src/index.ts']).transversal).toEqual([
			'tests/e2e/package-archives.e2e.test.ts',
			'tests/e2e/rest.e2e.test.ts',
		])
	})
	it('does not turn one changed root suite into a complete run', () => {
		expect(select(['tests/e2e/rest.e2e.test.ts'])).toMatchObject({
			packages: [],
			transversal: ['tests/e2e/rest.e2e.test.ts'],
			coverage: false,
		})
	})
	it.each([
		'yarn.lock',
		'package.json',
		'vitest.config.ts',
		'.github/workflows/ci.yml',
		'.changeset/config.json',
		'tests/fixtures/storage.ts',
		'tests/e2e/fixtures/child.mjs',
		'packages/http-plugin/package.json',
		'packages/removed/package.json',
		'packages/core/src/removed.test.ts',
		'unknown/script.ts',
	])('falls back to full validation for %s', (file) => {
		expect(select([file])).toMatchObject({
			full: true,
			coverage: true,
			build: true,
		})
	})
	it('supports a manual complete run even with an empty diff', () => {
		expect(select([], true).transversal).toHaveLength(3)
		expect(select([], true).packages).toHaveLength(5)
	})
	it('keeps website code changes out of framework tests', () => {
		expect(select(['apps/website/components/landing.tsx'])).toMatchObject({
			packages: [],
			transversal: [],
			website: true,
			build: false,
			coverage: false,
		})
	})
	it('recognizes generated imports and relative fixture chains, including cycles', () => {
		const input = new Map(files)
		input.set('tests/e2e/template.e2e.test.ts', "import './fixtures/a.js'")
		input.set('tests/e2e/fixtures/a.ts', "import './b.js'")
		input.set(
			'tests/e2e/fixtures/b.ts',
			"import './a.js'; const source = `import '@ultimabase/rest-plugin'`",
		)
		expect(
			selectCi({
				files: input,
				workspaces,
				changed: ['packages/rest-plugin/src/index.ts'],
				affected: ['@ultimabase/rest-plugin'],
			}).transversal,
		).toContain('tests/e2e/template.e2e.test.ts')
	})
	it('requests Chromium only for selected browser tests', () => {
		const input = new Map(files)
		input.set(
			'packages/http-plugin/src/browser.test.ts',
			"import { chromium } from 'playwright'",
		)
		const plan = selectCi({
			files: input,
			workspaces,
			changed: ['packages/http-plugin/src/index.ts'],
			affected: ['@ultimabase/http-plugin', '@ultimabase/rest-plugin'],
		})
		expect(
			plan.packages.find(({ name }) => name === '@ultimabase/http-plugin')
				?.browser,
		).toBe(true)
		expect(
			plan.packages.find(({ name }) => name === '@ultimabase/rest-plugin')
				?.browser,
		).toBe(false)
	})
	it('follows subprocess fixtures and repository-relative declaration probes', () => {
		const input = new Map(files)
		input.set(
			'tests/e2e/subprocess.e2e.test.ts',
			"path.join(import.meta.dirname, 'fixtures/child.mjs')",
		)
		input.set(
			'tests/e2e/fixtures/child.mjs',
			"import '@ultimabase/rest-plugin'",
		)
		input.set(
			'tests/e2e/declarations.e2e.test.ts',
			"const declaration = 'packages/rest-plugin/dist/index.d.ts'",
		)
		expect(
			selectCi({
				files: input,
				workspaces,
				changed: ['packages/rest-plugin/src/index.ts'],
				affected: ['@ultimabase/rest-plugin'],
			}).transversal,
		).toEqual(
			expect.arrayContaining([
				'tests/e2e/subprocess.e2e.test.ts',
				'tests/e2e/declarations.e2e.test.ts',
			]),
		)
	})
})

it('selects every repository suite exactly once during full GitHub validation', () => {
	const root = path.resolve(import.meta.dirname, '../..')
	const repositoryFiles = new Map(
		globSync(
			['packages/*/src/**/*.ts', 'packages/*/tests/**/*.ts', 'tests/**/*.ts'],
			{ cwd: root },
		).map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
	)
	const repositoryWorkspaces = globSync('packages/*/package.json', {
		cwd: root,
	}).map((file) => ({
		name: `@ultimabase/${file.split('/')[1] ?? ''}`,
		directory: path.posix.dirname(file),
	}))
	const plan = selectCi({
		files: repositoryFiles,
		workspaces: repositoryWorkspaces,
		changed: [],
		affected: [],
		full: true,
	})
	const selected = [
		...plan.packages.flatMap(({ files: local }) => local),
		...plan.transversal,
	].sort()
	// Compare with Vitest's actual inventory rather than restating its include globs.
	const output: unknown = JSON.parse(
		execFileSync(
			process.execPath,
			[
				path.join(root, 'node_modules/vitest/vitest.mjs'),
				'list',
				'--filesOnly',
				'--json',
			],
			{ cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
		),
	)
	if (!Array.isArray(output)) throw new TypeError('Expected Vitest inventory')
	const expected = output
		.flatMap((entry: unknown) => {
			if (
				typeof entry !== 'object' ||
				entry === null ||
				!('file' in entry) ||
				typeof entry.file !== 'string' ||
				!('projectName' in entry) ||
				typeof entry.projectName !== 'string'
			)
				throw new TypeError('Invalid inventory')
			const file = path.relative(root, entry.file)
			return ['unit', 'types', 'e2e', 'postgres-e2e', 'performance'].includes(
				entry.projectName,
			) && !file.startsWith('tooling/')
				? [file]
				: []
		})
		.sort()
	expect(selected).toEqual(expected)
	expect(new Set(selected).size).toBe(selected.length)
})
