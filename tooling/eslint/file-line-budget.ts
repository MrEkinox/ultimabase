import path from 'node:path'

import type { Rule } from 'eslint'

export interface FileLineBudgetPolicy {
	readonly productionMaximum: number
	readonly repositoryRoot: string
	readonly testMaximum: number
}

const generatedArtifactPattern =
	/(?:^|\/)(?:coverage|dist|node_modules)\/|\.generated(?:\.d)?\.ts$/u
const testFilePattern =
	/(?:^|\/)tests?\/|\.test(?:-d)?\.ts$|^tooling\/vitest\/typescript-language-service\.ts$/u

const relativeFilename = (repositoryRoot: string, filename: string): string =>
	path.relative(repositoryRoot, filename).replaceAll(path.sep, '/')

/** Enforces hard limits for handwritten source while excluding generated files. */
export const createFileLineBudgetRule = (
	policy: FileLineBudgetPolicy,
): Rule.RuleModule => ({
	meta: {
		docs: {
			description: 'Enforce repository line budgets for handwritten files.',
		},
		messages: {
			topLevelLimit:
				'File has {{actual}} lines, above the {{limit}} line {{kind}} budget.',
		},
		schema: [],
		type: 'suggestion',
	},
	create: (context) => ({
		Program: (node) => {
			const filename = relativeFilename(policy.repositoryRoot, context.filename)
			if (generatedArtifactPattern.test(filename)) return

			const sourceLines = context.sourceCode.lines
			const actual =
				sourceLines.at(-1) === '' ? sourceLines.length - 1 : sourceLines.length
			const isTest = testFilePattern.test(filename)
			const maximum = isTest ? policy.testMaximum : policy.productionMaximum
			if (actual > maximum) {
				context.report({
					data: {
						actual: String(actual),
						kind: isTest ? 'test' : 'production',
						limit: String(maximum),
					},
					messageId: 'topLevelLimit',
					node,
				})
			}
		},
	}),
})
