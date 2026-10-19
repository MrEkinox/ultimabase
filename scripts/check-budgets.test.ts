import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { budgetFile, checkBudgets, countLines } from './check-budgets.ts'

const workspace = (
	budgets: Record<string, number>,
	files: Record<string, string>,
): string => {
	const root = mkdtempSync(join(tmpdir(), 'budgets-'))
	writeFileSync(join(root, budgetFile), JSON.stringify(budgets))
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), content)
	}
	return root
}

const lines = (count: number): string => 'x\n'.repeat(count)

describe('countLines', () => {
	it('counts lines with or without a final newline', () => {
		expect(countLines('')).toBe(0)
		expect(countLines('a')).toBe(1)
		expect(countLines('a\nb\n')).toBe(2)
	})
})

describe('checkBudgets', () => {
	it('accepts a package within its budget', () => {
		const root = workspace(
			{ core: 5 },
			{ 'packages/core/src/index.ts': lines(5) },
		)
		expect(checkBudgets(root)).toEqual([])
	})

	it('reports a package over its budget, nested files included', () => {
		const root = workspace(
			{ core: 5 },
			{
				'packages/core/src/index.ts': lines(3),
				'packages/core/src/deep/a.ts': lines(3),
			},
		)
		expect(checkBudgets(root)).toEqual(['packages/core: 6 lines, budget 5'])
	})

	it('does not count tests', () => {
		const root = workspace(
			{ core: 1 },
			{
				'packages/core/src/index.ts': lines(1),
				'packages/core/src/index.test.ts': lines(50),
				'packages/core/src/types.test-d.ts': lines(50),
				'packages/core/src/test/helpers.ts': lines(50),
			},
		)
		expect(checkBudgets(root)).toEqual([])
	})

	it('reports a package without a budget and a budget without a package', () => {
		const root = workspace(
			{ gone: 10 },
			{ 'packages/core/src/index.ts': lines(1) },
		)
		expect(checkBudgets(root)).toEqual([
			`packages/core has no budget in ${budgetFile}`,
			`${budgetFile} lists "gone", which has no package`,
		])
	})

	it('rejects a budget that is not a positive integer', () => {
		const root = workspace({ core: 1.5 }, {})
		expect(() => checkBudgets(root)).toThrow('positive integer')
	})
})
