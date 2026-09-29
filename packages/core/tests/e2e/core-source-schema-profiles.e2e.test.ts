import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageServiceWorkspace } from '../../../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const completionMarker = '/* source-contract-completion */'
const hoverMarker = '/* source-contract-hover */'

const createProfileSource = (
	mode: 'packed' | 'source',
	schemaCount: number,
): string => {
	const moduleSpecifier =
		mode === 'packed' ? '@ultimabase/core' : '../../src/index.js'
	const schemas = Array.from({ length: schemaCount }, (_, schemaIndex) => {
		const fields = Array.from(
			{ length: 12 },
			(_, fieldIndex) =>
				`    field${String(fieldIndex)}: field.${fieldIndex % 2 === 0 ? 'string' : 'int'}(${fieldIndex === 0 ? '{ required: true }' : ''}),`,
		).join('\n')

		return `const Schema${String(schemaIndex)} = UltimaBase.Schema.define({
  className: 'Profile${String(schemaIndex)}',
  fields: (field) => ({
${fields}
    details: field.object({
      fields: (embedded) => ({ label: embedded.string({ required: true }) }),
    }),
    labels: field.string({ list: true }),
  }),
})`
	}).join('\n\n')
	const usages = Array.from(
		{ length: schemaCount },
		(
			_,
			schemaIndex,
		) => `const result${String(schemaIndex)} = Schema${String(schemaIndex)}.findMany({
  select: { field0: true, field1: true },
  where: { field0: { startsWith: 'value' }, field1: { gte: 1 } },
})
void result${String(schemaIndex)}`,
	).join('\n')

	return `import { UltimaBase } from '${moduleSpecifier}'

${schemas}

${usages}

const completion = Schema0.findMany({ where: { ${completionMarker} } })
const ${hoverMarker}hovered = Schema0.findMany({
  select: { field0: true, field1: true },
})
void [completion, hovered]
`
}

describe.each(['source', 'packed'] as const)(
	'exact Core source-schema profiles through %s declarations',
	(mode) => {
		it.each([1, 10, 50] as const)(
			'keeps completion, hover, and diagnostics bounded for %i schemas',
			(schemaCount) => {
				const sourceWithMarkers = createProfileSource(mode, schemaCount)
				const completionPosition = sourceWithMarkers.indexOf(completionMarker)
				const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
				const source = sourceWithMarkers
					.replace(completionMarker, ' '.repeat(completionMarker.length))
					.replace(hoverMarker, ' '.repeat(hoverMarker.length))
				const fileName = path.join(
					repositoryRoot,
					'packages/core/tests/e2e',
					`.source-contract-${mode}-${String(schemaCount)}.fixture.ts`,
				)
				const workspace = createLanguageServiceWorkspace({
					currentDirectory: repositoryRoot,
				})
				workspace.addFile(fileName, source)

				try {
					expect(
						workspace.service.getSemanticDiagnostics(fileName),
					).toStrictEqual([])
					const completions =
						workspace.service
							.getCompletionsAtPosition(fileName, completionPosition, {})
							?.entries.map(({ name }) => name) ?? []
					expect(completions).toEqual(
						expect.arrayContaining(['field0', 'field11', 'id']),
					)

					const hover = workspace.service.getQuickInfoAtPosition(
						fileName,
						hoverPosition + hoverMarker.length,
					)
					const display = ts.displayPartsToString(hover?.displayParts)
					expect(display).toContain('Promise')
					expect(display.length).toBeLessThan(2_000)
				} finally {
					workspace.service.dispose()
				}
			},
			30_000,
		)
	},
)
