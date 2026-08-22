import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const runtimeRoot = path.resolve(import.meta.dirname, '../../src/runtime')

/** Reads only handwritten production modules so fixtures cannot satisfy the audit. */
const readProductionSources = (
	directory: string,
): readonly Readonly<{ file: string; source: string }>[] =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name)

		if (entry.isDirectory()) return readProductionSources(file)
		if (
			!entry.name.endsWith('.ts') ||
			entry.name.endsWith('.test.ts') ||
			entry.name.endsWith('.test-d.ts')
		) {
			return []
		}

		return [{ file, source: readFileSync(file, 'utf8') }]
	})

const relativeFile = (file: string): string => path.relative(runtimeRoot, file)

const countMatches = (source: string, expression: RegExp): number =>
	[...source.matchAll(expression)].length

describe('single-pass field-validation responsibility audit', () => {
	const sources = readProductionSources(runtimeRoot)

	it('confines application validation to the mandatory final mutation path', () => {
		const applicationExecutions = sources.flatMap(({ file, source }) =>
			countMatches(source, /applicationValidation:\s*true/gu) === 0
				? []
				: [relativeFile(file)],
		)
		const directValidatorCallers = sources.flatMap(({ file, source }) => {
			if (file.endsWith('field-standard-schema.ts')) return []

			return countMatches(source, /validateFieldStandardSchema\(/gu) === 0
				? []
				: [relativeFile(file)]
		})

		expect(applicationExecutions).toStrictEqual([
			'validation/runtime-validation.ts',
		])
		expect(directValidatorCallers.sort()).toStrictEqual([
			'validation/projected-arithmetic-validation.ts',
			'validation/runtime-validation.ts',
		])
	})

	it('gives only finalMutationValidation ownership of both complete-value paths', () => {
		const completeValueImport =
			/import\s*\{[^}]*\b(?:revalidateRuntimeMutationOperation|validateProjectedMutationArithmetic)\b[^}]*\}\s*from/su
		const importers = sources.flatMap(({ file, source }) =>
			completeValueImport.test(source) ? [relativeFile(file)] : [],
		)

		expect(importers).toStrictEqual(['validation/final-mutation-validation.ts'])
	})

	it('keeps intermediate mutation replacements and results structural-only', () => {
		const boundaries = readFileSync(
			path.join(runtimeRoot, 'behaviors/validation-boundaries.ts'),
			'utf8',
		)
		const runtimeValidation = readFileSync(
			path.join(runtimeRoot, 'validation/runtime-validation.ts'),
			'utf8',
		)

		expect(boundaries).toContain('snapshotRuntimeMutationOperation')
		expect(boundaries).not.toContain('revalidateRuntimeMutationOperation')
		expect(runtimeValidation).toMatch(
			/export const snapshotRuntimeResultRecord[\s\S]*?createStructuralValidationExecution\(\)/u,
		)
	})
})
