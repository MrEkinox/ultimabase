import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { accessPlugin, type AccessPluginOptions } from '../src/index.js'
import {
	createFixtureDatabase,
	fixtureRowId,
} from './access-fixtures.test-support.js'

// ADR-0317, decisions 1 and 3: one rule per operation, its detailed form,
// read granularity and partial field rules, at runtime.
const App = UltimaBase.use(accessPlugin())
const Post = App.Schema.define({
	className: 'RuleFormPost',
	fields: (field) => ({
		secret: field.string({ access: { write: { clear: false } } }),
		title: field.string({ access: { read: { where: false } } }),
	}),
}).with((plugins) =>
	plugins.access({
		read: ({ where }) => where.eq('secret', 'hidden'),
		update: {
			where: ({ where }) => where.eq('secret', 'hidden'),
			item: ({ item }) => item.title !== 'blocked',
		},
	}),
)
const Counted = App.Schema.define({
	className: 'RuleFormCounted',
	fields: (field) => ({ title: field.string() }),
}).with((plugins) => plugins.access({ read: { many: true, exists: false } }))

const run = async <TResult>(
	schema: SchemaDefinition,
	scenario: (
		ultimabase: Awaited<ReturnType<typeof start>>['ultimabase'],
		database: ReturnType<typeof createFixtureDatabase>,
	) => Promise<TResult>,
	options: AccessPluginOptions = {},
): Promise<TResult> => {
	const { database, ultimabase } = await start(schema, options)
	try {
		return await scenario(ultimabase, database)
	} finally {
		await ultimabase.dispose()
	}
}

const start = async (
	schema: SchemaDefinition,
	options: AccessPluginOptions,
) => {
	const database = createFixtureDatabase()
	const ultimabase = new (UltimaBase.use(
		accessPlugin(options),
		database.plugin,
	))({ logger: false, schemas: [schema] })
	await ultimabase.start()
	return { database, ultimabase }
}

describe('Access rule forms at runtime (ADR-0317)', () => {
	it('turns a returned filter into the private row filter', async () => {
		const request = await run(Post, async (_, { adapter }) => {
			await Post.findMany()
			return adapter.reads[0]
		})
		expect(request?.rowFilter).toEqual({
			field: 'secret',
			kind: 'equal',
			value: 'hidden',
		})
	})

	it('rules each read operation separately and lets allowWithoutRule decide omitted ones', async () => {
		const answers = await run(
			Counted,
			async (ultimabase) =>
				Promise.all(
					(['one', 'many', 'count', 'exists'] as const).map((operation) =>
						ultimabase.can({ operation, schema: Counted }),
					),
				),
			{ allowWithoutRule: { count: true } },
		)
		expect(answers).toEqual([false, true, true, false])
	})

	it('checks the detailed item rule on the candidate', async () => {
		await run(Post, async () => {
			await expect(
				Post.updateOne({
					data: { title: 'blocked' },
					where: { id: { eq: fixtureRowId } },
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})
		await run(Post, async () => {
			await expect(
				Post.updateOne({
					data: { title: 'renamed' },
					where: { id: { eq: fixtureRowId } },
				}),
			).resolves.toMatchObject({ id: fixtureRowId })
		})
	})

	it('restricts only the field rule members that are declared', async () => {
		await run(Post, async () => {
			// `read: { where: false }`: output and ordering stay allowed.
			await expect(
				Post.findMany({ orderBy: { title: 'asc' } }),
			).resolves.toEqual([expect.objectContaining({ title: 'visible' })])
			await expect(
				Post.findMany({ where: { title: { eq: 'visible' } } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})
		await run(Post, async () => {
			// `write: { clear: false }`: fill and replace stay allowed.
			await expect(
				Post.updateOne({
					data: { secret: null },
					where: { id: { eq: fixtureRowId } },
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})
		await run(Post, async () => {
			await expect(
				Post.updateOne({
					data: { secret: 'changed' },
					where: { id: { eq: fixtureRowId } },
				}),
			).resolves.toMatchObject({ id: fixtureRowId })
		})
	})

	it('rejects a JavaScript rule that returns nothing or a filter where none applies', async () => {
		const Untyped = App.Schema.define({
			className: 'RuleFormUntyped',
			fields: (field) => ({ title: field.string() }),
		}).with((plugins) =>
			plugins.access({
				read: (() => undefined) as never,
				create: (() => ({ title: 'x' })) as never,
			}),
		)
		await run(Untyped, async () => {
			await expect(Untyped.findMany()).rejects.toThrow(
				'Access rule RuleFormUntyped.access.read must return true, false, a WhereInput or a WhereBuilder',
			)
			await expect(Untyped.createOne({ data: { title: 'x' } })).rejects.toThrow(
				'Access rule RuleFormUntyped.access.create must return a boolean',
			)
		})
	})
})
