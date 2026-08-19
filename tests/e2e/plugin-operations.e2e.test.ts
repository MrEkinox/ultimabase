import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/plugin-operation-no-typegen.mjs',
)

describe('packed plugin operation execution', () => {
	it('executes direct and fake-transport calls from JavaScript without Typegen', async () => {
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
			dynamicSchemaResult: {
				echo: 'schema:JavaScriptDynamicPost:dynamic',
			},
			inspection: {
				operations: [
					'fixture.javascript.inspect',
					'fixture.javascript.inspect-schema',
					'fixture.javascript.inspect-model',
				],
				plugins: [
					'fixture.javascript-database',
					'fixture.javascript-operations',
				],
				schemas: ['JavaScriptStablePost', 'JavaScriptDynamicPost'],
			},
			modelResult: { echo: 'model:draft:draft' },
			stableSchemaResult: {
				echo: 'schema:JavaScriptStablePost:stable',
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
