import {
	databasePersistencePlanCapability,
	dateTimeField,
	runWithRequestEngine,
	UltimaBase,
} from '@ultimabase/core'
import {
	anonymous,
	holdsSchemaPermission,
	openApplicationHarness,
	waitForAfterCommitWork,
} from '@ultimabase/core/plugin'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { afterEach, describe, expect, it } from 'vitest'

import { testDatabaseFilterOperators } from '../../../../tooling/vitest/database-filter-operators.js'
import { MemoryTestDatabase } from '../../../../tooling/vitest/memory-database.js'
import { testDatabasePlugin } from '../../../../tooling/vitest/test-database.js'

// A definePlugin plugin at work in a started application: its commands write,
// its afterCommit sees committed writes with the schema's rules, and its
// feature permissions exist where the feature is set (ADR-0339, ADR-0317).
const commits: unknown[] = []
const anyString: unknown = expect.any(String)
const archivePlugin = definePlugin({
	name: '@community/archive',
	version: '1.0.0',
	features: {
		archivable: feature({
			fields: { archivedAt: dateTimeField() },
			permissions: ['readArchived'],
			commands: {
				archiveOne: command({
					authority: 'request',
					effect: 'update',
					data: () => ({ archivedAt: '2026-10-18T00:00:00.000Z' }),
				}),
				purgeOne: command({ authority: 'master', effect: 'delete' }),
			},
		}),
	},
	rules: {
		audit: (value, path) => {
			if (typeof value !== 'boolean') {
				throw new TypeError(`${path} must be a boolean`)
			}
			return value
		},
	},
	afterCommit: (input) => {
		commits.push(input)
	},
})

const App = UltimaBase.use(
	testDatabasePlugin(
		new MemoryTestDatabase({
			capabilities: {
				filterOperators: testDatabaseFilterOperators,
				persistencePlans: databasePersistencePlanCapability,
			},
		}),
		{ id: 'fixture.database' },
	),
	archivePlugin,
)
const Post = App.Schema.define({
	className: 'RuntimePost',
	fields: (field) => ({ title: field.string({ required: true }) }),
	archivable: true,
}).with({ audit: true })
const Note = App.Schema.define({
	className: 'RuntimeNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})

const start = async () => {
	const ultimabase = new App({ logger: false, schemas: [Post, Note] })
	const harness = openApplicationHarness(ultimabase)
	await ultimabase.start()
	const asMaster = async <TResult>(callback: () => Promise<TResult>) =>
		runWithRequestEngine(
			await harness.master({ requestId: 'master', source: 'fixture' }),
			callback,
		)
	return { asMaster, ultimabase }
}

afterEach(() => {
	commits.length = 0
})

describe('definePlugin at runtime', () => {
	it('runs feature commands with the data they declare', async () => {
		const { asMaster, ultimabase } = await start()
		try {
			const post = await Post.createOne({ data: { title: 'Draft' } })
			const archived = await Post.archiveOne({
				id: post.id,
				select: { archivedAt: true },
			})
			expect(archived.archivedAt).toBe('2026-10-18T00:00:00.000Z')
			// A delete command needs Master; with it, the row is gone.
			await expect(Post.purgeOne({ id: post.id })).rejects.toMatchObject({
				code: 'MASTER_ACCESS_DENIED',
			})
			await asMaster(() => Post.purgeOne({ id: post.id }))
			expect(await Post.count()).toBe(0)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('calls afterCommit after each committed write, with the rules only', async () => {
		const { asMaster, ultimabase } = await start()
		try {
			const post = await Post.createOne({ data: { title: 'Draft' } })
			await Post.archiveOne({ id: post.id })
			await Note.createOne({ data: { body: 'Plain' } })
			await asMaster(() => Post.purgeOne({ id: post.id }))
			// Reads never reach afterCommit.
			await Post.count()
			await Post.findMany({})
			await waitForAfterCommitWork()
			expect(commits).toStrictEqual([
				{
					className: 'RuntimePost',
					operation: 'create-one',
					requestId: anyString,
					rules: { audit: true },
				},
				{
					className: 'RuntimePost',
					operation: 'archiveOne',
					requestId: anyString,
					rules: { audit: true },
				},
				{
					className: 'RuntimeNote',
					operation: 'create-one',
					requestId: anyString,
					rules: {},
				},
				{
					className: 'RuntimePost',
					operation: 'purgeOne',
					requestId: 'master',
					rules: { audit: true },
				},
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('declares feature permissions only on the schemas that set the feature', async () => {
		const { ultimabase } = await start()
		try {
			const { context } = anonymous(ultimabase, {
				requestId: 'permissions',
				source: 'fixture',
			})
			// Declared, and refused when no policy grants it.
			expect(await holdsSchemaPermission(context, Post, 'readArchived')).toBe(
				false,
			)
			await expect(
				holdsSchemaPermission(context, Note, 'readArchived'),
			).rejects.toThrow(
				'Permission readArchived is not declared for RuntimeNote',
			)
		} finally {
			await ultimabase.dispose()
		}
	})
})

// Defect found by this suite: `command()` accepts an update without `data`
// (it defaults to writing `{}`), but Core refuses every such run with
// PLUGIN_OPERATION_INVALID "Update schema mutation … must return one
// non-empty data object", which the caller sees only as "The requested
// operation could not be completed.". Pending a decision (refuse it in
// command(), like a delete with data, or give it a meaning), this test
// states the authoring-time refusal.
describe('update commands without data', () => {
	it('are refused when declared, since Core could never run them', () => {
		expect(() => command({ authority: 'request', effect: 'update' })).toThrow(
			TypeError,
		)
	})
})
