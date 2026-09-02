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

describe('Core structural-validation responsibility audit', () => {
	const sources = readProductionSources(runtimeRoot)

	it('contains no application field-validation product vocabulary', () => {
		const prohibited = [
			'@standard-schema/spec',
			'FieldStandardSchema',
			'applicationValidation',
			'field.validation',
			'validateFieldStandardSchema',
		]
		const violations = sources.flatMap(({ file, source }) =>
			prohibited.flatMap((term) =>
				source.includes(term)
					? [`${path.relative(runtimeRoot, file)}:${term}`]
					: [],
			),
		)

		expect(violations).toStrictEqual([])
	})

	it('keeps final mutations, intermediate replacements, and results structural', () => {
		const boundaries = readFileSync(
			path.join(runtimeRoot, 'behaviors/validation-boundaries.ts'),
			'utf8',
		)
		const runtimeValidation = readFileSync(
			path.join(runtimeRoot, 'validation/runtime-validation.ts'),
			'utf8',
		)
		const finalMutationValidation = readFileSync(
			path.join(runtimeRoot, 'validation/final-mutation-validation.ts'),
			'utf8',
		)

		expect(boundaries).toContain('snapshotRuntimeMutationOperation')
		expect(boundaries).not.toContain('revalidateRuntimeMutationOperation')
		expect(finalMutationValidation).toContain(
			'revalidateRuntimeMutationOperation',
		)
		expect(runtimeValidation).toMatch(
			/export const snapshotRuntimeResultRecord[\s\S]*?createStructuralValidationExecution\(\)/u,
		)
	})
})
