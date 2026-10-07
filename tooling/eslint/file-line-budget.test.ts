import path from 'node:path'

import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import {
	createFileLineBudgetRule,
	type FileLineBudgetPolicy,
} from './file-line-budget.js'

const policy: FileLineBudgetPolicy = {
	productionMaximum: 600,
	repositoryRoot: path.resolve(import.meta.dirname, '../..'),
	testMaximum: 700,
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

describe('repository file line budget', () => {
	it('enforces 600 production lines and 700 test lines', () => {
		expect(verify('src/focused.ts', 600)).toStrictEqual([])
		expect(verify('src/focused.ts', 601)[0]?.messageId).toBe('topLevelLimit')
		expect(verify('src/focused.test.ts', 700)).toStrictEqual([])
		expect(verify('src/focused.test.ts', 701)[0]?.messageId).toBe(
			'topLevelLimit',
		)
	})

	it('applies the test budget to fixture modules', () => {
		expect(verify('packages/core/tests/e2e/fixture.ts', 700)).toStrictEqual([])
		expect(
			verify('packages/core/tests/e2e/fixture.ts', 701)[0]?.messageId,
		).toBe('topLevelLimit')
	})

	it('applies the test budget to language-service and type-test modules', () => {
		expect(
			verify('tooling/vitest/typescript-language-service.ts', 701)[0]
				?.messageId,
		).toBe('topLevelLimit')
		expect(verify('src/contracts.test-d.ts', 700)).toStrictEqual([])
		expect(verify('src/contracts.test-d.ts', 701)[0]?.messageId).toBe(
			'topLevelLimit',
		)
	})

	it('reports the applicable file kind and limit', () => {
		expect(verify('src/oversized.ts', 601)[0]?.message).toContain(
			'600 line production budget',
		)
		expect(verify('src/oversized.test.ts', 701)[0]?.message).toContain(
			'700 line test budget',
		)
	})

	it('excludes generated artifacts by path', () => {
		expect(verify('src/schema.generated.ts', 1_000)).toStrictEqual([])
		expect(verify('dist/index.ts', 1_000)).toStrictEqual([])
	})
})
