import process from 'node:process'

import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const databaseUrl = process.env.ULTIMABASE_TEST_DATABASE_URL
if (databaseUrl === undefined) {
	throw new TypeError('ULTIMABASE_TEST_DATABASE_URL is required')
}

const Application = UltimaBase.use(
	softDeletePlugin(),
	postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
)
const Command = Application.Schema.define({
	className: 'JavaScriptSoftDeleteCommand',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
	.softDelete({ mode: 'command' })
	.with({})
const Logical = Application.Schema.define({
	className: 'JavaScriptSoftDeleteLogical',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
	.softDelete()
	.with({})
const Plain = Application.Schema.define({
	className: 'JavaScriptSoftDeletePlain',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({})
const audits = []
const ultimabase = new Application({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'javascript-soft-delete', value: 'javascript-master-key' }],
		onUse: (event) => audits.push(event.reason),
	}),
	logger: false,
	schemas: [Command, Logical, Plain],
})

await ultimabase.start()

const surface = (className) => [
	...(ultimabase
		.compile()
		.schemaSurfaces.find(({ schema }) => schema.className === className)
		?.schemaMutations.keys() ?? []),
]

try {
	const command = await Command.createOne({
		data: { title: 'Command JavaScript' },
	})
	await Command.softDeleteOne({ id: command.id })
	const hiddenCommand = await Command.count({})
	await Command.restoreOne({ id: command.id })
	const restoredCommand = await Command.count({})
	await Command.softDeleteOne({ id: command.id })
	await Command.purgeOne({ id: command.id }, { useMasterKey: true })
	const purgedCommand = await Command.count({}, { useMasterKey: true })

	const logical = await Logical.createOne({
		data: { title: 'Logical JavaScript' },
	})
	await Logical.deleteOne({ where: { id: logical.id } })
	const hiddenLogical = await Logical.count({})

	const plain = await Plain.createOne({
		data: { title: 'Plain JavaScript' },
	})
	await Plain.deleteOne({ where: { id: plain.id } })
	const deletedPlain = await Plain.exists({
		where: { id: { eq: plain.id } },
	})

	process.stdout.write(
		`${JSON.stringify({
			auditCount: audits.length,
			deletedPlain,
			hiddenCommand,
			hiddenLogical,
			purgedCommand,
			restoredCommand,
			surfaces: {
				command: surface(Command.className),
				logical: surface(Logical.className),
				plain: surface(Plain.className),
			},
		})}\n`,
	)
} finally {
	await ultimabase.dispose()
}
