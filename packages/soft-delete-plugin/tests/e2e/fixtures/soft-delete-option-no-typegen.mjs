import { stdout } from 'node:process'

import { Schema, UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const ExplicitPost = Schema.define({
	className: 'JavaScriptSoftDeleteExplicitPost',
	fields: (field) => ({ title: field.string() }),
	softDelete: 'explicit',
})
const OmittedPost = Schema.define({
	className: 'JavaScriptSoftDeleteOmittedPost',
	fields: (field) => ({ title: field.string() }),
})
const application = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [softDeletePlugin({ defaultMode: 'replace-delete' })],
	schemas: [ExplicitPost, OmittedPost],
})
await application.initialize()

const compiled = application.compile()
const explicit = compiled.schemas.get(ExplicitPost.className)
const omitted = compiled.schemas.get(OmittedPost.className)
const option = explicit?.provenance.options.softDelete?.definition
const explicitSurface = compiled.typegenGraph.schemaSurfaces.find(
	({ schema }) => schema.className === ExplicitPost.className,
)
const omittedSurface = compiled.typegenGraph.schemaSurfaces.find(
	({ schema }) => schema.className === OmittedPost.className,
)

stdout.write(
	`${JSON.stringify({
		defaultMode: option?.normalizedStaticOptions.defaultMode,
		explicitMode: explicit?.definition.softDelete,
		explicitModelMutations: [...(explicitSurface?.modelMutations.keys() ?? [])],
		explicitSchemaMutations: [
			...(explicitSurface?.schemaMutations.keys() ?? []),
		],
		explicitTombstone: explicit?.persistedFields.isDeleted?.options,
		omissionPreserved: !Object.hasOwn(omitted?.definition ?? {}, 'softDelete'),
		omittedSchemaMutations: [...(omittedSurface?.schemaMutations.keys() ?? [])],
		omittedTombstoneOwner: omitted?.provenance.fields.isDeleted?.owner.pluginId,
		owner: option?.owner,
	})}\n`,
)

await application.dispose()
