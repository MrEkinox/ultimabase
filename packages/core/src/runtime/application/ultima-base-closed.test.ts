import { describe, expect, it } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { contributeApplication } from '../../plugins/plugin-contributions.js'
import { plugin } from '../../plugins/plugin.js'
import type { PluginSetupContext } from '../../plugins/setup-registries.js'
import { anonymous } from './plugin-authority.js'
import { UltimaBase } from './ultima-base.js'

// ADR-0340 decisions 2 and 6: the started application exposes when it
// closes, and start() refuses schemas without a database.
const Article = UltimaBase.Schema.define({
	className: 'ClosedArticle',
	fields: (field) => ({ title: field.string() }),
})

const settled = async (promise: Promise<unknown>): Promise<boolean> => {
	let done = false
	void promise.then(() => {
		done = true
	})
	// Two macrotask turns let every queued continuation run.
	await new Promise((resolve) => setTimeout(resolve, 0))
	await new Promise((resolve) => setTimeout(resolve, 0))
	return done
}

const databasePlugin = () =>
	plugin({
		id: 'fixture.closed-database',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
	})

describe('UltimaBase closed', () => {
	it('resolves once the started application stops', async () => {
		const ultimabase = applicationFixture(
			new UltimaBase({ logger: false, schemas: [] }),
		)
		const { closed } = ultimabase
		expect(ultimabase.closed).toBe(closed)

		const started = await ultimabase.start()

		expect(started.closed).toBe(closed)
		expect(await settled(closed)).toBe(false)
		await ultimabase.stop()
		await expect(closed).resolves.toBeUndefined()
		expect(ultimabase.state).toBe('stopped')
	})

	it('resolves when an await using scope disposes the application', async () => {
		const ultimabase = new UltimaBase({ logger: false, schemas: [] })
		{
			await using started = await ultimabase.start()
			expect(await settled(started.closed)).toBe(false)
		}
		await expect(ultimabase.closed).resolves.toBeUndefined()
		expect(ultimabase.state).toBe('disposed')
	})

	it('stays pending when stop() runs before start()', async () => {
		const ultimabase = applicationFixture(
			new UltimaBase({ logger: false, schemas: [] }),
		)
		await ultimabase.stop()
		expect(await settled(ultimabase.closed)).toBe(false)
		await ultimabase.start()
		await ultimabase.dispose()
		await expect(ultimabase.closed).resolves.toBeUndefined()
	})

	it('resolves when a failed start closes the application', async () => {
		const failing = plugin({
			id: 'fixture.closed-failing-start',
			version: '0.0.0',
			core: '^0.0.0',
			contributions: [
				contributeApplication(() => ({
					connect: () => {
						throw new Error('connect failed')
					},
				})),
			],
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(failing))({ logger: false, schemas: [] }),
		)

		await expect(ultimabase.start()).rejects.toThrow('connect failed')
		await expect(ultimabase.closed).resolves.toBeUndefined()
	})

	it('lets a plugin stop the application it belongs to', async () => {
		let context: PluginSetupContext | undefined
		const stopper = plugin({
			id: 'fixture.closed-stopper',
			version: '0.0.0',
			core: '^0.0.0',
			contributions: [
				contributeApplication((setup) => {
					context = setup
					return {}
				}),
			],
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(stopper))({ logger: false, schemas: [] }),
		)
		await ultimabase.start()

		await context?.stopApplication()

		expect(ultimabase.state).toBe('stopped')
		await expect(ultimabase.closed).resolves.toBeUndefined()
	})
})

describe('UltimaBase without a database', () => {
	it('refuses to start with schemas, naming the missing capability', async () => {
		const ultimabase = applicationFixture(
			new UltimaBase({ logger: false, schemas: [Article] }),
		)

		await expect(ultimabase.start()).rejects.toThrow(
			new TypeError(
				'UltimaBase cannot start: 1 schema is registered (ClosedArticle) but no plugin provides the database capability ultimabase.database-adapter. Install a database plugin with UltimaBase.use(...).',
			),
		)
		await expect(ultimabase.closed).resolves.toBeUndefined()
	})

	it('starts without schemas and explains why requests cannot run', async () => {
		const ultimabase = applicationFixture(
			new UltimaBase({ logger: false, schemas: [] }),
		)
		expect(() =>
			anonymous(ultimabase, { requestId: 'early', source: 'internal' }),
		).toThrow(
			new TypeError('UltimaBase must be started before request execution'),
		)

		await ultimabase.start()

		expect(() =>
			anonymous(ultimabase, { requestId: 'no-database', source: 'internal' }),
		).toThrow(
			new TypeError(
				'UltimaBase cannot execute requests: no plugin provides the database capability ultimabase.database-adapter',
			),
		)
	})

	it('starts with schemas once a database plugin is installed', async () => {
		const ultimabase = applicationFixture(
			new (UltimaBase.use(databasePlugin()))({
				logger: false,
				schemas: [Article],
			}),
		)

		await expect(ultimabase.start()).resolves.toBe(ultimabase)
	})
})
