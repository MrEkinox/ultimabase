import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import {
	createFileLineBudgetRule,
	type FileLineBudgetPolicy,
} from './file-line-budget.js'

import { handwrittenFileLineBaseline } from './file-line-budget.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const policy: FileLineBudgetPolicy = {
	baseline: { 'src/legacy.ts': 700 },
	productionMaximum: 600,
	repositoryRoot,
	testMaximum: 750,
}
const plugin = {
	rules: { 'file-line-budget': createFileLineBudgetRule(policy) },
}

const verify = (relativePath: string, lines: number) =>
	new Linter({ configType: 'flat' }).verify(
		Array.from({ length: lines }, () => 'void 0').join('\n'),
		[
			{
				files: ['**/*.ts'],
				languageOptions: { parserOptions: { ecmaVersion: 'latest' } },
				plugins: { repository: plugin },
				rules: { 'repository/file-line-budget': 'error' },
			},
		],
		{ filename: relativePath },
	)

const lineCount = (filename: string): number => {
	const contents = readFileSync(filename, 'utf8')
	const lines = contents.split('\n')
	return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

describe('repository file line budget', () => {
	it('enforces separate production and test hard limits', () => {
		expect(verify('src/focused.ts', 600)).toStrictEqual([])
		expect(verify('src/focused.ts', 601)[0]?.messageId).toBe('topLevelLimit')
		expect(verify('src/focused.test.ts', 750)).toStrictEqual([])
		expect(verify('src/focused.test.ts', 751)[0]?.messageId).toBe(
			'topLevelLimit',
		)
	})

	it('rejects baseline growth and requires every reduction to be recorded', () => {
		expect(verify('src/legacy.ts', 700)).toStrictEqual([])
		expect(verify('src/legacy.ts', 701)[0]?.messageId).toBe('baselineGrowth')
		expect(verify('src/legacy.ts', 650)[0]?.messageId).toBe('baselineReduction')
		expect(verify('src/legacy.ts', 600)[0]?.messageId).toBe('removeBaseline')
	})

	it('excludes generated artifacts by path', () => {
		expect(verify('src/schema.generated.ts', 1_000)).toStrictEqual([])
		expect(verify('dist/index.ts', 1_000)).toStrictEqual([])
	})

	it('keeps every reviewed baseline equal to its current file size', () => {
		for (const [relativePath, baseline] of Object.entries(
			handwrittenFileLineBaseline,
		)) {
			expect(
				lineCount(path.join(repositoryRoot, relativePath)),
				relativePath,
			).toBe(baseline)
		}
	})

	it('keeps split schema declaration modules and focused suites within budget', () => {
		const pluginDirectory = path.join(
			repositoryRoot,
			'packages/core/src/plugins',
		)
		const files = readdirSync(pluginDirectory, { withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.startsWith('schema-'))
			.map(({ name }) => name)

		for (const name of files) {
			const lines = lineCount(path.join(pluginDirectory, name))
			if (name.endsWith('.test.ts') || name.endsWith('.test-d.ts')) {
				expect(lines, name).toBeLessThanOrEqual(750)
			} else {
				expect(lines, name).toBeLessThanOrEqual(500)
			}
		}
	})
})
