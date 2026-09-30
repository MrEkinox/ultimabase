import process from 'node:process'

import { MasterAuthority, Schema, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const databaseUrl = process.env.ULTIMABASE_TEST_DATABASE_URL
if (databaseUrl === undefined) {
	throw new TypeError('ULTIMABASE_TEST_DATABASE_URL is required')
}

const Explicit = Schema.define({
	className: 'JavaScriptSoftDeleteExplicit',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'explicit',
})
const Replace = Schema.define({
	className: 'JavaScriptSoftDeleteReplace',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'replace-delete',
})
const Disabled = Schema.define({
	className: 'JavaScriptSoftDeleteDisabled',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
const audits = []
const Application = UltimaBase.use(
	softDeletePlugin({ defaultMode: 'disabled' }),
	postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
)
const ultimabase = new Application({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'javascript-soft-delete', value: 'javascript-master-key' }],
		onUse: (event) => audits.push(event.reason),
	}),
	pluginPrivileges: { logger: false },
	schemas: [Explicit, Replace, Disabled],
})

await ultimabase.start()

try {
	const explicit = await Explicit.createOne(
		{ data: { title: 'Explicit JavaScript' } },
		{ ultimabase },
	)
	const explicitHandle = ultimabase.schema(Explicit)
	await explicitHandle.softDelete({ id: explicit.id })
	const hiddenExplicit = await Explicit.count({}, { ultimabase })
	await explicitHandle.restore({ id: explicit.id }, { useMasterKey: true })
	const restoredExplicit = await Explicit.count({}, { ultimabase })
	await explicitHandle.softDelete({ id: explicit.id })
	await explicitHandle.purge({ id: explicit.id }, { useMasterKey: true })
	const purgedExplicit = await Explicit.count({}, { ultimabase })

	const replace = await Replace.createOne(
		{ data: { title: 'Replace JavaScript' } },
		{ ultimabase },
	)
	await Replace.deleteOne({ id: replace.id }, { ultimabase })
	const hiddenReplace = await Replace.count({}, { ultimabase })

	const disabled = await Disabled.createOne(
		{ data: { title: 'Disabled JavaScript' } },
		{ ultimabase },
	)
	await Disabled.deleteOne({ id: disabled.id }, { ultimabase })
	const deletedDisabled = await Disabled.exists(
		{ where: { id: { eq: disabled.id } } },
		{ ultimabase },
	)

	process.stdout.write(
		`${JSON.stringify({
			auditCount: audits.length,
			deletedDisabled,
			hiddenExplicit,
			hiddenReplace,
			purgedExplicit,
			restoredExplicit,
			surfaces: {
				disabled: [
					...(ultimabase
						.compile()
						.typegenGraph.schemaSurfaces.find(
							({ schema }) => schema.className === Disabled.className,
						)
						?.schemaMutations.keys() ?? []),
				],
				explicit: [
					...(ultimabase
						.compile()
						.typegenGraph.schemaSurfaces.find(
							({ schema }) => schema.className === Explicit.className,
						)
						?.schemaMutations.keys() ?? []),
				],
				replace: [
					...(ultimabase
						.compile()
						.typegenGraph.schemaSurfaces.find(
							({ schema }) => schema.className === Replace.className,
						)
						?.schemaMutations.keys() ?? []),
				],
			},
		})}\n`,
	)
} finally {
	await ultimabase.dispose()
}
