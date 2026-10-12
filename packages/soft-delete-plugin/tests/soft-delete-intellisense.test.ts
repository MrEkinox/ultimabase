import path from 'node:path'

import { UltimaBase } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { softDeletePlugin } from '../src/index.js'

const marker = '/* soft-delete-method */'

it('offers the shape method and types its commands with and without Typegen', () => {
	const SoftDeleteApplication = UltimaBase.use(softDeletePlugin())
	const Document = SoftDeleteApplication.Schema.define({
		className: 'SoftDeleteIntellisenseDocument',
		fields: (field) => ({ title: field.string() }),
	})
		.softDelete({ mode: 'command' })
		.with({})
	const generated = generateApplicationTypes({
		ultimabase: new SoftDeleteApplication({
			logger: false,
			schemas: [Document],
		}),
		applicationId: 'fixture.soft-delete-intellisense',
	})
	const sourceWithMarker = `${generated.contents}
import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const SourceApplication = UltimaBase.use(softDeletePlugin())
const Completion = SourceApplication.Schema.define({
  className: 'SoftDeleteCompletion',
  fields: (field) => ({ title: field.string() }),
}).${marker}softDelete().with({})
const Command = SourceApplication.Schema.define({
  className: 'SoftDeleteCommand',
  fields: (field) => ({ title: field.string() }),
}).softDelete({ mode: 'command' }).with({})
const Installed = SourceApplication.Schema.define({
  className: 'SoftDeleteIntellisenseDocument',
  fields: (field) => ({ title: field.string() }),
}).softDelete({ mode: 'command' }).with({})
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

	expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	expect(completions).toContain('softDelete')
	expect(generated.contents).toContain(
		'PluginSchemaMutationNoInput as Plugin0_PluginSchemaMutationNoInput',
	)
	expect(generated.snapshot.options).toStrictEqual([])
	expect(generated.snapshot.surfaces[0]?.schemaMutations).toEqual([
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
			mutation: 'ultimabase.soft-delete-plugin.soft-delete.soft-delete-one',
			name: 'softDeleteOne',
			returning: 'after',
		}),
	])
	expect(generated.contents).toContain(
		'readonly softDeleteOne: Core.ApplicationSchemaMutationMethod',
	)
	expect(generated.contents).toContain(
		'readonly restoreMany: Core.ApplicationSchemaMutationManyMethod',
	)
	// ADR-0310: no model surface; soft delete is a schema method only.
	expect(generated.contents).not.toContain(
		'ApplicationModelSchemaMutationMethod',
	)
	const generatedDocument = generated.snapshot.schemas.find(
		({ className }) => className === Document.className,
	)
	for (const name of ['isDeleted', 'deletedAt']) {
		expect(
			generatedDocument?.fields.find((field) => field.name === name),
		).toMatchObject({
			name,
		})
	}
	service.dispose()
})
