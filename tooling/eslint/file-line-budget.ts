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
		'packages/acl-permissions-plugin/src/plugin.test.ts': 1036,
		'packages/acl-permissions-plugin/src/plugin.ts': 883,
		'packages/core/src/plugins/capability-composition.test.ts': 1159,
		'packages/core/src/query/filters/factory.ts': 662,
		'packages/core/src/query/filters/where.ts': 1610,
		'packages/core/src/query/query/input.ts': 792,
		'packages/core/src/query/query/query.ts': 700,
		'packages/core/src/runtime/enforcement/dispatcher.test.ts': 895,
		'packages/core/src/runtime/engine/framework-engine.ts': 793,
		'packages/core/src/runtime/behaviors/validation-boundaries.ts': 1019,
		'packages/core/src/runtime/pipeline/inclusion-projection.ts': 708,
		'packages/core/src/runtime/pipeline/runtime-pipeline.test.ts': 1127,
		'packages/core/src/runtime/validation/runtime-validation.test.ts': 807,
		'packages/core/src/runtime/validation/runtime-validation.ts': 1314,
		'packages/core/src/schema/schema/definition.ts': 851,
		'packages/core/tests/runtime/bulk-terminals.test.ts': 898,
		'packages/postgres-plugin/src/drizzle/adapter.test.ts': 1692,
		'packages/postgres-plugin/src/drizzle/operation-executor.ts': 622,
		'packages/postgres-plugin/src/drizzle/prepared-operation.ts': 780,
		'packages/postgres-plugin/src/query/filter-compiler.test.ts': 804,
		'packages/postgres-plugin/src/query/filter-compiler.ts': 650,
		'packages/typegen/src/generator-language-service.test.ts': 864,
		'tests/e2e/relation-postgres.postgres.e2e.test.ts': 943,
		'tests/e2e/runtime-postgres.postgres.e2e.test.ts': 1139,
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
