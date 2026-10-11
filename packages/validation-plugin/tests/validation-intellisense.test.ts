import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	createLanguageServiceFixture,
	createLanguageServiceWorkspace,
} from '../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = (name: string) =>
	path.join(import.meta.dirname, `validation-intellisense-${name}.fixture.ts`)

const source = `
import { UltimaBase } from '@ultimabase/core'
import { z } from 'zod'
import { validationPlugin } from '../src/plugin.js'

const App = UltimaBase.use(validationPlugin())
App.Schema.define({
  className: 'IntellisenseValidation',
  fields: (field) => ({
    title: field.string({ /* title-hover */validation: z.string().trim() }),
    count: field.int({ validation: z.string() }),
  }),
})
`

// ADR-0319: a mismatched validator names the mismatch; hovers use the named type.
describe('Validation IntelliSense', () => {
	it('names a mismatched validator and prints FieldValidator<string>', () => {
		const file = fixtureFile('messages')
		const fixture = createLanguageServiceFixture(
			file,
			source,
			['/* title-hover */'],
			createLanguageServiceWorkspace(),
		)
		const messages = fixture.service
			.getSemanticDiagnostics(file)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(messages).toHaveLength(1)
		expect(messages[0]).toContain('validation must accept number, got string')

		const hover = fixture.service.getQuickInfoAtPosition(
			file,
			fixture.positionOf('/* title-hover */') + '/* title-hover */'.length,
		)
		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'FieldValidator<string>',
		)
	})
})
