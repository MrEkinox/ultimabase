import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'
import { expectActionableFieldOptionDiagnostics } from './field-option-diagnostic-expectations.js'

const sourceFixtureFile = path.join(
	import.meta.dirname,
	'field-option-diagnostics.prototype.txt',
)
const fixtureFile = path.join(
	import.meta.dirname,
	'field-option-diagnostics.fixture.ts',
)

it('reports field option incompatibilities on the options contract', async () => {
	const source = await readFile(sourceFixtureFile, 'utf8')
	const service = createLanguageService(fixtureFile, source)
	expectActionableFieldOptionDiagnostics(
		service.getSemanticDiagnostics(fixtureFile),
	)
	service.dispose()
})
