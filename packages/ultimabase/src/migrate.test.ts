// How `start` follows the models (D-105): a development database syncs and
// logs it, refuses what loses data, and a production one is only checked.
import { afterEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, memory } from './index.ts'
import { hashOf, synced } from './migrate.ts'
import { schemaOf } from './lifecycle.ts'
import type { FakeState } from './test/migrating.ts'
import { fakeState, migrating, recording } from './test/migrating.ts'

const Locker = defineModel({
	name: 'Locker',
	fields: (f) => ({ label: f.string(), size: f.number() }),
})
const Renamed = defineModel({
	name: 'Locker',
	fields: (f) => ({ title: f.string(), size: f.number() }),
})
const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ label: f.string() }),
})

const Grown = defineModel({
	name: 'Locker',
	fields: (f) => ({
		label: f.string(),
		size: f.number(),
		floor: f.number(),
		room: f.string(),
	}),
})

const environment = process.env['NODE_ENV']
afterEach(() => {
	process.env['NODE_ENV'] = environment
})

function app(
	state: FakeState,
	...models: (typeof Locker | typeof Renamed | typeof Shelf | typeof Grown)[]
) {
	const logger = recording()
	return {
		logger,
		app: defineApp({ database: migrating(state), models, logger }),
	}
}

describe('hashOf', () => {
	it('ignores the order of keys', () => {
		expect(hashOf({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(
			hashOf({ b: [{ d: 3, c: 2 }], a: 1 }),
		)
		expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }))
	})
})

describe('a development start', () => {
	it('builds an empty database, then syncs each change and logs it', async () => {
		const state = fakeState()
		const first = app(state, Locker)
		await first.app.start()
		await first.app.stop()
		expect(first.logger.lines).toContain("Created the database's tables.")
		expect(state.stored?.by).toBe('sync')

		const second = app(state, Locker, Shelf)
		await second.app.start()
		await second.app.stop()
		expect(second.logger.lines).toContain('Synced Shelf: created.')
		expect(state.runs).toHaveLength(2)

		const third = app(state, Locker, Shelf)
		await third.app.start()
		await third.app.stop()
		expect(state.runs).toHaveLength(2)
	})

	it('groups what changed by model', async () => {
		const state = fakeState()
		const schema = schemaOf({ database: memory(), models: [Locker] })
		state.stored = {
			snapshot: migrating().migrations?.snapshot(schema),
			by: 'sync',
			applied: [],
		}
		const { app: grown, logger } = app(state, Grown)
		await grown.start()
		await grown.stop()
		expect(logger.lines).toContain('Synced Locker: added floor, added room.')
	})

	it('refuses a change that loses data, and says how to make it', async () => {
		const state = fakeState()
		const first = app(state, Locker, Shelf)
		await first.app.start()
		await first.app.stop()
		const { app: renamed } = app(state, Renamed)
		await expect(renamed.start()).rejects.toThrow(
			[
				'UltimaBase did not sync Locker, Shelf: removing "Locker.label" deletes data; removing Shelf deletes its rows.',
				"  -- a rename? keep its data: give Locker.title dbName: 'label'.",
				'  drop Locker.label;',
				'  drop Shelf;',
				'Run `npx ultimabase sync --force` to apply it to this development database,',
				'or `npx ultimabase migrate create <name>` to write it as a migration.',
			].join('\n'),
		)
		expect(state.runs).toHaveLength(1)
		// The refusal stopped the database: the application starts again.
		await first.app.start()
		await first.app.stop()
	})

	it('applies it with force', async () => {
		const state = fakeState()
		const first = app(state, Locker)
		await first.app.start()
		await first.app.stop()
		const database = migrating(state)
		const schema = schemaOf({ database, models: [Renamed] })
		const ran = await synced(database, schema, recording(), true)
		expect(ran?.map((statement) => statement.sql)).toStrictEqual([
			'drop Locker.label',
			'add Locker.title',
		])
	})

	it('leaves a database without migrations as it is', async () => {
		const database = memory()
		const schema = schemaOf({ database, models: [Locker] })
		await expect(
			synced(database, schema, recording(), false),
		).resolves.toBeUndefined()
	})
})

describe('a production start', () => {
	it('refuses a database that no deploy built', async () => {
		process.env['NODE_ENV'] = 'production'
		const { app: started } = app(fakeState(), Locker)
		await expect(started.start()).rejects.toThrow(
			'The database has no UltimaBase schema: run `npx ultimabase migrate deploy`, then start again.',
		)
	})

	it('refuses tables that are not the models', async () => {
		const state = fakeState()
		const first = app(state, Locker)
		await first.app.start()
		await first.app.stop()
		process.env['NODE_ENV'] = 'production'
		const { app: grown } = app(state, Locker, Shelf)
		await expect(grown.start()).rejects.toThrow(
			"The database's tables are not the models' (D-105): run `npx ultimabase migrate deploy`, then start again.",
		)
		expect(state.runs).toHaveLength(1)
	})

	it('starts on tables that are the models, and changes nothing', async () => {
		const state = fakeState()
		const first = app(state, Locker)
		await first.app.start()
		await first.app.stop()
		process.env['NODE_ENV'] = 'production'
		const { app: same } = app(state, Locker)
		await same.start()
		await same.stop()
		expect(state.runs).toHaveLength(1)
	})

	it('starts code rolled back from a deploy, and says so', async () => {
		process.env['NODE_ENV'] = 'production'
		const fake = migrating().migrations
		const hash = (...models: readonly (typeof Locker | typeof Shelf)[]) =>
			hashOf(fake?.snapshot(schemaOf({ database: memory(), models })))
		const state = fakeState()
		state.stored = {
			snapshot: fake?.snapshot(
				schemaOf({ database: memory(), models: [Locker, Shelf] }),
			),
			by: 'deploy',
			applied: [
				{ name: '1_init.sql', checksum: 'a', schema: hash(Locker) },
				{ name: '2_shelf.sql', checksum: 'b', schema: hash(Locker, Shelf) },
			],
		}
		const { app: rolled, logger } = app(state, Locker)
		await rolled.start()
		await rolled.stop()
		expect(logger.lines).toContain(
			'The database is ahead of the models: 2_shelf.sql was applied after them.',
		)
		state.stored = {
			...state.stored,
			applied: state.stored.applied.slice(0, 1),
		}
		await expect(app(state, Locker).app.start()).rejects.toThrow(
			"The database's tables are not the models'",
		)
		await expect(app(state, Shelf).app.start()).rejects.toThrow(
			"The database's tables are not the models'",
		)
	})

	it('starts a database without migrations', async () => {
		process.env['NODE_ENV'] = 'production'
		const started = defineApp({
			database: memory(),
			models: [Locker],
			logger: recording(),
		})
		await expect(started.start()).resolves.toBeUndefined()
		await started.stop()
	})
})
