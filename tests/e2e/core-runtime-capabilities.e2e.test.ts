import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
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
	})
})
