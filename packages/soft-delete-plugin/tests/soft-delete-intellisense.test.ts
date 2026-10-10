import path from 'node:path'

import { UltimaBase } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { softDeletePlugin } from '../src/index.js'

const marker = '/* soft-delete-option */'

it('offers the source-owned schema option and accepted values', () => {
	const SoftDeleteApplication = UltimaBase.use(softDeletePlugin())
	const Document = SoftDeleteApplication.Schema.define({
		className: 'SoftDeleteIntellisenseDocument',
		softDelete: 'explicit',
		fields: (field) => ({ title: field.string() }),
	})
	const generated = generateApplicationTypes({
		ultimabase: new SoftDeleteApplication({
			pluginPrivileges: { logger: false },
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
  ${marker}
  fields: (field) => ({ title: field.string() }),
})
const Explicit = SourceApplication.Schema.define({
  className: 'SoftDeleteExplicit',
  softDelete: 'explicit',
  fields: (field) => ({ title: field.string() }),
})
const Installed = SourceApplication.Schema.define({
  className: 'SoftDeleteIntellisenseDocument',
  fields: (field) => ({ title: field.string() }),
})
const deleted = Installed.softDelete({ id: 'document-1', select: { isDeleted: true } })
const restored = Installed.restore({ id: 'document-1' })
const purged = Installed.purge({ id: 'document-1' })
// @ts-expect-error -- Mutation inputs require the exact target id.
Installed.softDelete({ missing: 'document-1' })
const Disabled = SourceApplication.Schema.define({
  className: 'SoftDeleteDisabled',
  softDelete: false,
  fields: (field) => ({ title: field.string() }),
})
const Invalid = SourceApplication.Schema.define({
  className: 'SoftDeleteInvalid',
  // @ts-expect-error -- Schema overrides use false instead of the plugin-only disabled mode.
  softDelete: 'disabled',
  fields: (field) => ({ title: field.string() }),
})
void Completion
void Explicit
void Installed
void deleted
void restored
void purged
void Disabled
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
	expect(generated.contents).not.toContain('SoftDeleteSchemaOption')
	expect(generated.snapshot.surfaces[0]?.schemaMutations).toEqual([
		expect.objectContaining({
			authority: 'master',
			effect: 'delete',
			mutation: 'ultimabase.soft-delete.purge',
			name: 'purge',
			returning: 'before',
		}),
		expect.objectContaining({
			authority: 'master',
			effect: 'update',
			mutation: 'ultimabase.soft-delete.restore',
			name: 'restore',
			returning: 'after',
		}),
		expect.objectContaining({
			authority: 'request',
			effect: 'update',
			mutation: 'ultimabase.soft-delete.soft-delete',
			name: 'softDelete',
			returning: 'after',
		}),
	])
	expect(generated.contents).toContain(
		'readonly softDelete: Core.ApplicationSchemaMutationMethod',
	)
	// ADR-0310: no model surface; soft delete is a schema method only.
	expect(generated.contents).not.toContain(
		'ApplicationModelSchemaMutationMethod',
	)
	expect(generated.contents).toContain(
		'readonly restore: Core.ApplicationSchemaMutationMethod',
	)
	expect(generated.contents).toContain(
		'readonly purge: Core.ApplicationSchemaMutationMethod',
	)
	const generatedDocument = generated.snapshot.schemas.find(
		({ className }) => className === Document.className,
	)
	const tombstone = generatedDocument?.fields.find(
		({ name }) => name === 'isDeleted',
	)
	expect(tombstone).toMatchObject({
		name: 'isDeleted',
		typegen: {
			create: 'forbidden',
			object: 'required',
			update: 'forbidden',
		},
	})
	service.dispose()
})
