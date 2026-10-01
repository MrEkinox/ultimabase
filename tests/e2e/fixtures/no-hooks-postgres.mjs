import process from 'node:process'

import { UltimaBase, requestSources } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.ULTIMABASE_TEST_DATABASE_URL
if (databaseUrl === undefined) {
	throw new TypeError('ULTIMABASE_TEST_DATABASE_URL is required')
}

const Application = UltimaBase.use(
	postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
)
const Post = Application.Schema.define({
	className: 'JavaScriptNoEnginePost',
	postgres: { table: 'optional_hooks_javascript_posts' },
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
const ultimabase = new Application({
	pluginPrivileges: { logger: false },
	schemas: [Post],
})

await ultimabase.start()

try {
	const created = await Post.createOne(
		{ data: { title: 'JavaScript create' } },
		{ ultimabase },
	)
	const found = await Post.findOne(
		{ where: { id: { eq: created.id } } },
		{ ultimabase },
	)
	const request = ultimabase.anonymous({
		requestId: 'javascript-no-engine-transaction',
		source: requestSources.internal,
	})
	const committed = await request.transaction(async () => {
		await Post.createOne({ data: { title: 'JavaScript committed' } })
		return Post.count({ where: { title: { eq: 'JavaScript committed' } } })
	})
	const updated = await Post.updateOne(
		{ data: { title: 'JavaScript update' }, id: created.id },
		{ ultimabase },
	)
	let rollbackMessage = ''
	try {
		await request.transaction(async () => {
			await Post.createOne({ data: { title: 'JavaScript rollback' } })
			throw new Error('rollback JavaScript transaction')
		})
	} catch (error) {
		rollbackMessage = error instanceof Error ? error.message : 'unknown error'
	}
	const rolledBack = await Post.count(
		{ where: { title: { eq: 'JavaScript rollback' } } },
		{ ultimabase },
	)
	const deleted = await Post.deleteOne(
		{ id: created.id, select: { id: true, title: true } },
		{ ultimabase },
	)
	const existsAfterDelete = await Post.exists(
		{ where: { id: { eq: created.id } } },
		{ ultimabase },
	)
	const inspection = {
		options: ultimabase.compile().typegenGraph.options.map(({ name }) => name),
		plugins: ultimabase.pluginPrivilegeReport.plugins.map(
			({ identity }) => identity.pluginId,
		),
	}

	process.stdout.write(
		`${JSON.stringify({
			committed,
			created: created.title,
			deleted: deleted?.title,
			existsAfterDelete,
			found: found?.title,
			inspection,
			rollbackMessage,
			rolledBack,
			updated: updated?.title,
		})}\n`,
	)
} finally {
	await ultimabase.dispose()
}
