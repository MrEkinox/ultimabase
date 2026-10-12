import path from 'node:path'

import { UltimaBase } from '@ultimabase/core'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { softDeletePlugin } from '../src/index.js'

const marker = '/* soft-delete-method */'

it('offers the shape method and types its commands', async () => {
	const SoftDeleteApplication = UltimaBase.use(softDeletePlugin())
	const Document = SoftDeleteApplication.Schema.define({
		className: 'SoftDeleteIntellisenseDocument',
		fields: (field) => ({ title: field.string() }),
	}).softDelete({ mode: 'command' })
	const application = new SoftDeleteApplication({
		logger: false,
		schemas: [Document],
	})
	const sourceWithMarker = `import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const SourceApplication = UltimaBase.use(softDeletePlugin())
const Completion = SourceApplication.Schema.define({
  className: 'SoftDeleteCompletion',
  fields: (field) => ({ title: field.string() }),
}).${marker}softDelete()
const Command = SourceApplication.Schema.define({
  className: 'SoftDeleteCommand',
  fields: (field) => ({ title: field.string() }),
}).softDelete({ mode: 'command' })
const Installed = SourceApplication.Schema.define({
  className: 'SoftDeleteIntellisenseDocument',
  fields: (field) => ({ title: field.string() }),
}).softDelete({ mode: 'command' })
const deleted = Installed.softDeleteOne({ id: 'document-1', select: { isDeleted: true } })
const restored = Installed.restoreMany({ where: { title: { eq: 'x' } } })
const purged = Command.purgeOne({ id: 'document-1' })
// @ts-expect-error -- Mutation inputs require the exact target id.
Installed.softDeleteOne({ missing: 'document-1' })
const Invalid = SourceApplication.Schema.define({
  className: 'SoftDeleteInvalid',
  fields: (field) => ({ title: field.string() }),
// @ts-expect-error -- The only mode is 'command'; the default needs no option.
}).softDelete({ mode: 'replace-delete' })
void Completion
void deleted
void restored
void purged
void Invalid
`
	const position = sourceWithMarker.indexOf(marker)
	const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
	const fileName = path.join(import.meta.dirname, 'soft-delete.fixture.ts')
	const service = createLanguageService(fileName, source)
	const completions =
		service
			.getCompletionsAtPosition(fileName, position, {})
			?.entries.map(({ name }) => name) ?? []

	try {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
		expect(completions).toContain('softDelete')
		const compiled = application.compile()
		const mutations = compiled.schemaSurfaces[0]?.schemaMutations
		expect(
			[...(mutations?.entries() ?? [])].map(([name, { mutation }]) => ({
				authority: mutation.authority,
				effect: mutation.effect,
				mutation: mutation.name,
				name,
				returning: mutation.returning,
				target: mutation.target,
			})),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					authority: 'master',
					effect: 'delete',
					mutation: 'ultimabase.soft-delete-plugin.soft-delete.purge-many',
					name: 'purgeMany',
					returning: 'before',
					target: 'many',
				}),
				expect.objectContaining({
					authority: 'master',
					effect: 'delete',
					mutation: 'ultimabase.soft-delete-plugin.soft-delete.purge-one',
					name: 'purgeOne',
					returning: 'before',
					target: 'one',
				}),
				expect.objectContaining({
					authority: 'request',
					effect: 'update',
					mutation: 'ultimabase.soft-delete-plugin.soft-delete.restore-many',
					name: 'restoreMany',
					target: 'many',
				}),
				expect.objectContaining({
					authority: 'request',
					effect: 'update',
					mutation: 'ultimabase.soft-delete-plugin.soft-delete.restore-one',
					name: 'restoreOne',
					returning: 'after',
					target: 'one',
				}),
				expect.objectContaining({
					name: 'softDeleteMany',
					target: 'many',
				}),
				expect.objectContaining({
					authority: 'request',
					effect: 'update',
					mutation:
						'ultimabase.soft-delete-plugin.soft-delete.soft-delete-one',
					name: 'softDeleteOne',
					returning: 'after',
				}),
			]),
		)
		expect(mutations?.size).toBe(6)
		const fields = compiled.schemas.get(Document.className)?.fields
		expect(fields).toHaveProperty('isDeleted')
		expect(fields).toHaveProperty('deletedAt')
	} finally {
		service.dispose()
		await application.dispose()
	}
})
