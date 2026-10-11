import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageServiceFixture } from '../../tooling/vitest/typescript-language-service.js'

// ADR-0317: with `Register`, `.with` rules receive `SchemaRef<"Note">`; Access
// still offers the plugin command and permission keys of that schema.
const fixtureFile = path.join(
	import.meta.dirname,
	'access-registered-rule-keys.fixture.ts',
)
const source = `
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const App = UltimaBase.use(accessPlugin(), softDeletePlugin())

export const Note = App.Schema.define({
  className: 'Note',
  fields: (field) => ({ title: field.string() }),
})
  .softDelete()
  .with({
    access: {
      read: true,
      softDeleteOne: isAuthenticated,
      readDeleted: isAuthenticated,
      /* keys:note */
    },
  })

export const Tag = App.Schema.define({
  className: 'Tag',
  fields: (field) => ({ label: field.string() }),
}).with({ access: { read: true, readDeleted: true } })

export const ultimabase = new App({ schemas: [Note, Tag] })

declare module '@ultimabase/core' {
  interface Register {
    readonly app: typeof ultimabase
  }
}
`

describe('Access rule keys of registered schemas (ADR-0317)', () => {
	const fixture = createLanguageServiceFixture(fixtureFile, source, [
		'/* keys:note */',
	])

	it('accepts command and permission keys where the shape method is called', () => {
		expect(
			fixture.service
				.getSemanticDiagnostics(fixtureFile)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([
			expect.stringContaining("'readDeleted' does not exist in type"),
		])
		expect(
			fixture.service
				.getCompletionsAtPosition(
					fixtureFile,
					fixture.positionOf('/* keys:note */'),
					{},
				)
				?.entries.map(({ name }) => name),
		).toEqual(
			expect.arrayContaining(['restoreOne', 'softDeleteMany', 'update']),
		)
	})
})
