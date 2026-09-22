import path from 'node:path'
import { it } from 'vitest'

import { assertFieldPathLanguageContract } from '../field-path-language-contract.js'

// A compiled-package language service can exceed the default timeout under parallel E2E load.
it('preserves precise Hooks paths and editor help through compiled exports', () => {
	assertFieldPathLanguageContract(
		path.join(import.meta.dirname, 'field-path-built.fixture.ts'),
		'@ultimabase/hooks-plugin',
	)
}, 20_000)
