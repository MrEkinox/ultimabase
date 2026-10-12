import { stdout } from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const Application = UltimaBase.use(softDeletePlugin())
const CommandPost = Application.Schema.define({
	className: 'JavaScriptSoftDeleteCommandPost',
	fields: (field) => ({ title: field.string() }),
})
	.softDelete({ mode: 'command' })
	.with({})
const LogicalPost = Application.Schema.define({
	className: 'JavaScriptSoftDeleteLogicalPost',
	fields: (field) => ({ title: field.string() }),
})
	.softDelete()
	.with({})
const PlainPost = Application.Schema.define({
	className: 'JavaScriptSoftDeletePlainPost',
	fields: (field) => ({ title: field.string() }),
}).with({})
const application = new Application({
	logger: false,
	schemas: [CommandPost, LogicalPost, PlainPost],
})
await application.initialize()

const compiled = application.compile()
const command = compiled.schemas.get(CommandPost.className)
const logical = compiled.schemas.get(LogicalPost.className)
const plain = compiled.schemas.get(PlainPost.className)
const surface = (className) => [
	...(compiled.schemaSurfaces
		.find(({ schema }) => schema.className === className)
		?.schemaMutations.keys() ?? []),
]

stdout.write(
	`${JSON.stringify({
		commandMode: command?.definition.softDelete,
		commandSchemaMutations: surface(CommandPost.className),
		deletedAt: logical?.persistedFields.deletedAt?.kind,
		logicalMode: logical?.definition.softDelete,
		logicalSchemaMutations: surface(LogicalPost.className),
		owner: command?.provenance.options.softDelete?.definition.owner,
		plainSchemaMutations: surface(PlainPost.className),
		plainTombstone: plain?.persistedFields.isDeleted === undefined,
		tombstone: logical?.persistedFields.isDeleted?.options,
	})}\n`,
)

await application.dispose()
