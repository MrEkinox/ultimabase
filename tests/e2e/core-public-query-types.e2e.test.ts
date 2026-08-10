import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { expectCanonicalQueryTypeHovers } from '../../packages/core/tests/query/public-query-type-expectations.js'
import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/query/public-query-types.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-public-query-types.packed.fixture.ts',
)

describe('packed @ultimabase/core public Query types', () => {
	it('exports only the canonical names with exact inclusion extraction', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
		expectCanonicalQueryTypeHovers(
			(marker) => languageFixture.readHover(marker).display,
		)
	})
})
