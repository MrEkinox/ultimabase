import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const executeFile = promisify(execFile)
const javascriptFixtureFile = path.join(
	import.meta.dirname,
	'fixtures/runtime-mutation-guard-no-typegen.mjs',
)
const requestExecutorJavascriptFixtureFile = path.join(
	import.meta.dirname,
	'fixtures/application-request-executor-no-typegen.mjs',
)
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/runtime/runtime-capabilities-language-service.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-runtime-capabilities.packed.fixture.ts',
)

describe('packed @ultimabase/core Runtime capabilities', () => {
	it('preserves exact operation and result types through public-only imports', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
		expect(languageFixture.readHover('runtime-executor').display).toContain(
			'type RuntimeExecutorFactory',
		)
		expect(
			languageFixture.readHover('runtime-final-mutation-guard').display,
		).toContain('type RuntimeFinalMutationGuardStage')
		expect(
			languageFixture.readHover('application-request-executor').display,
		).toContain('interface ApplicationRequestExecutor')
		expect(
			languageFixture.readHover('application-operation-transport-planner')
				.display,
		).toContain('interface ApplicationOperationTransportPlanner')
	})

	it('executes a final mutation guard from JavaScript without Typegen', async () => {
		const { stdout } = await executeFile(process.execPath, [
			javascriptFixtureFile,
		])
		const output: unknown = JSON.parse(stdout)

		expect(output).toStrictEqual({
			message: 'JavaScript mutation guard rejected input',
			trace: ['guard:create-one:undefined', 'rollback'],
		})
	})

	it('executes an attributed application request from JavaScript without Typegen', async () => {
		const { stdout } = await executeFile(process.execPath, [
			requestExecutorJavascriptFixtureFile,
		])
		const output: unknown = JSON.parse(stdout)

		expect(output).toStrictEqual({
			access: { mode: 'anonymous' },
			activeRequestId: 'javascript-request-executor',
			requestId: 'javascript-request-executor',
			source: 'fixture-http',
		})
	})
})
