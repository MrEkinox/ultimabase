import path from 'node:path'

import { UltimaBase, Schema, type SchemaOptions } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { softDeletePlugin, type SoftDeleteSchemaOption } from '../src/index.js'

const marker = '/* soft-delete-option */'

it('offers only the generated direct schema option and accepted values', () => {
	const Document = Schema.define({
		className: 'SoftDeleteIntellisenseDocument',
		softDelete: 'explicit',
		fields: (field) => ({ title: field.string() }),
	} as SchemaOptions<'SoftDeleteIntellisenseDocument'> & {
		readonly softDelete: SoftDeleteSchemaOption
	})
	const generated = generateApplicationTypes({
		ultimabase: new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [softDeletePlugin()],
			schemas: [Document],
		}),
		applicationId: 'fixture.soft-delete-intellisense',
	})
	const sourceWithMarker = `${generated.contents}
import { Schema } from '@ultimabase/core'

const Completion = Schema.define({
  className: 'SoftDeleteCompletion',
  ${marker}
  fields: (field) => ({ title: field.string() }),
})
const Explicit = Schema.define({
  className: 'SoftDeleteExplicit',
  softDelete: 'explicit',
  fields: (field) => ({ title: field.string() }),
})
declare const ultimabase: import('@ultimabase/core').UltimaBase<readonly [], readonly []>
const Installed = Schema.define({
  className: 'SoftDeleteIntellisenseDocument',
  fields: (field) => ({ title: field.string() }),
})
const deleted = Installed.softDelete({ id: 'document-1', select: { isDeleted: true } }, { ultimabase })
const restored = Installed.restore({ id: 'document-1' }, { ultimabase, useMasterKey: true })
const purged = Installed.purge({ id: 'document-1' }, { ultimabase, useMasterKey: true })
// @ts-expect-error -- Mutation inputs require the exact target id.
Installed.softDelete({ missing: 'document-1' }, { ultimabase })
const Disabled = Schema.define({
  className: 'SoftDeleteDisabled',
  softDelete: false,
  fields: (field) => ({ title: field.string() }),
})
const Invalid = Schema.define({
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
	expect(generated.contents).toContain(
		'SoftDeleteSchemaOption as Plugin1_SoftDeleteSchemaOption',
	)
	expect(generated.contents).toContain('from "@ultimabase/soft-delete-plugin"')
	expect(generated.contents).toContain(
		'readonly softDelete?: Plugin1_SoftDeleteSchemaOption',
	)
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
	expect(generated.contents).toContain(
		'readonly softDelete: Core.ApplicationModelSchemaMutationMethod',
	)
	expect(generated.contents).toContain(
		'readonly restore: Core.ApplicationSchemaMutationMethod',
	)
	expect(generated.contents).toContain(
		'readonly purge: Core.ApplicationSchemaMutationMethod',
	)
	expect(generated.contents).not.toContain(
		'readonly restore: Core.ApplicationModelSchemaMutationMethod',
	)
	expect(generated.contents).not.toContain(
		'readonly purge: Core.ApplicationModelSchemaMutationMethod',
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
