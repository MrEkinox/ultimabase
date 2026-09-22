import path from 'node:path'

import type { Rule } from 'eslint'

export interface FileLineBudgetPolicy {
	readonly baseline: Readonly<Record<string, number>>
	readonly productionMaximum: number
	readonly repositoryRoot: string
	readonly testMaximum: number
}

/** Records only pre-existing handwritten exceptions and must never be increased. */
export const handwrittenFileLineBaseline: Readonly<Record<string, number>> =
	Object.freeze({
		'packages/core/tests/e2e/relation-postgres.postgres.e2e.test.ts': 943,
		'packages/core/tests/e2e/runtime-postgres.postgres.e2e.test.ts': 1139,
	})

const generatedArtifactPattern =
	/(?:^|\/)(?:coverage|dist|node_modules)\/|\.generated(?:\.d)?\.ts$/u
const testFilePattern =
	/(?:^|\/)tests?\/|\.test(?:-d)?\.ts$|^tooling\/prototypes\/generated-schema-authoring\/|^tooling\/vitest\/typescript-language-service\.ts$/u

const relativeFilename = (repositoryRoot: string, filename: string): string =>
	path.relative(repositoryRoot, filename).replaceAll(path.sep, '/')

/** Enforces hard limits and keeps every temporary exception equal to its shrinking baseline. */
export const createFileLineBudgetRule = (
	policy: FileLineBudgetPolicy,
): Rule.RuleModule => ({
	meta: {
		docs: {
			description:
				'Enforce repository line budgets and decreasing handwritten baselines.',
		},
		messages: {
			baselineGrowth:
				'File has {{actual}} lines, above its reviewed baseline of {{limit}}. Split or reduce the file; never increase the baseline.',
			baselineReduction:
				'File now has {{actual}} lines. Reduce its reviewed baseline from {{limit}} to {{actual}}.',
			removeBaseline:
				'File now fits the {{limit}} line budget. Remove its temporary baseline entry.',
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
			const baseline = policy.baseline[filename]

			if (baseline === undefined) {
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
				return
			}

			if (actual > baseline) {
				context.report({
					data: { actual: String(actual), limit: String(baseline) },
					messageId: 'baselineGrowth',
					node,
				})
				return
			}

			if (actual <= maximum) {
				context.report({
					data: { limit: String(maximum) },
					messageId: 'removeBaseline',
					node,
				})
				return
			}

			if (actual < baseline) {
				context.report({
					data: { actual: String(actual), limit: String(baseline) },
					messageId: 'baselineReduction',
					node,
				})
			}
		},
	}),
})
