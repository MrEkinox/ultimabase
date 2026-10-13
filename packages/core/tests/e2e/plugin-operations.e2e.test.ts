import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'
import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/plugin-operation-javascript.mjs',
)

describe('packed plugin operation execution', () => {
	it.each(['../../packages/core/src/plugin.js', '@ultimabase/core/plugin'])(
		'keeps the tooling contract descriptive in %s',
		(moduleName) => {
			const fileName = path.resolve(
				import.meta.dirname,
				'../../../../tests/e2e/compiled-inspection.fixture.ts',
			)
			const source = `
import type { CompiledApplication } from '${moduleName === '@ultimabase/core/plugin' ? '@ultimabase/core' : '../../packages/core/src/index.js'}'
import type { PluginOperationDefinition } from '${moduleName}'
declare const graph: CompiledApplication
const operation = graph.operations[0]!.operation
const schema = graph.schemaSurfaces[0]!.schema
const name: string = schema.className
// @ts-expect-error -- Inspection has no executable input contract.
void operation.input
// @ts-expect-error -- Inspection has no executable result contract.
void operation.result
// @ts-expect-error -- Inspection is not a nominal executable operation token.
const token: PluginOperationDefinition = operation
// @ts-expect-error -- Inspection has no schema constructor.
new schema({})
void name
void token
`
			const service = createLanguageService(fileName, source)
			expect(service.getSemanticDiagnostics(fileName)).toEqual([])
			service.dispose()
		},
	)

	it('executes direct and fake-transport calls from JavaScript', async () => {
		const { stdout } = await executeFile(process.execPath, [fixturePath])
		const output: unknown = JSON.parse(stdout)

		expect(output).toStrictEqual({
			conformanceChecks: [
				'manifest',
				'privilege-denial',
				'capability-contracts',
				'static-determinism',
				'provenance',
				'lifecycle-cleanup',
				'application-isolation',
				'javascript-operation',
			],
			directResult: { echo: 'direct' },
			nativeResults: {
				title: 'JavaScript result',
				dynamicSchema: 'JavaScriptDynamicPost',
				frozenResult: true,
				plainResult: true,
				stableSchema: true,
			},
			inspection: {
				callbackFree: true,
				constructorFree: true,
				operations: ['fixture.javascript.inspect'],
				plugins: [
					'fixture.javascript-database',
					'fixture.javascript-operations',
				],
				schemas: ['JavaScriptStablePost', 'JavaScriptDynamicPost'],
				selectedFields: [
					'title',
					'id',
					'createdAt',
					'updatedAt',
					'documentState',
				],
			},
			transportErrorResponse: {
				error: {
					code: 'fixture.javascript.rejected',
					message: 'Rejected by JavaScript fixture.',
					retryable: false,
				},
				ok: false,
			},
			transportResponse: {
				ok: true,
				result: { text: 'transport' },
			},
		})
	})
})
