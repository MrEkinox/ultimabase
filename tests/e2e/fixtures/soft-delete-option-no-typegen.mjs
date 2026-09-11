import { stdout } from 'node:process'

import { FrameworkApplication, Schema } from '@ultimabase/core'
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
const application = new FrameworkApplication({
	pluginPrivileges: { logger: false },
	plugins: [softDeletePlugin({ defaultMode: 'replace-delete' })],
	schemas: [ExplicitPost, OmittedPost],
})
await application.initialize()

const explicit = application.schemas.get(ExplicitPost.className)
const omitted = application.schemas.get(OmittedPost.className)
const option = explicit?.provenance.options.softDelete?.definition
const explicitSurface = application.getSchemaSurface(ExplicitPost.className)
const omittedSurface = application.getSchemaSurface(OmittedPost.className)

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
