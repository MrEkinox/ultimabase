// The change feed (D-154): the adapter gets one only when a plugin takes
// changes; each plugin gets them in declaration order, a failing one logged.
import { expect, it, vi } from 'vitest'
import type { Adapter, Feed } from './adapter.ts'
import type { Logger } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

const manifest = {
	name: 'feed-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

/** memory(), keeping the feed its `start` was given. */
function kept(): {
	readonly database: Adapter
	readonly feed: () => Feed | undefined
} {
	const database = memory()
	let feed: Feed | undefined
	return {
		database: {
			...database,
			start: async (schema, logger, given) => {
				feed = given
				return database.start(schema, logger, given)
			},
		},
		feed: () => feed,
	}
}

const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		errors.push([first, message])
	},
	child: () => logger,
}

it('gives the adapter no feed when no plugin takes changes', async () => {
	const { database, feed } = kept()
	const quiet = definePlugin({
		name: 'quiet',
		manifest,
		missed: () => undefined,
	})
	const app = defineApp({
		database,
		models: [Note],
		plugins: [quiet.plugin()],
		logger,
	})
	await app.start()
	expect(feed()).toBeUndefined()
	await app.stop()
})

it("calls each plugin's hooks in order, past a plugin that fails", async () => {
	const { database, feed } = kept()
	const calls: string[] = []
	const failing = definePlugin({
		name: 'failing',
		manifest,
		changed: () => {
			throw new Error('Broken.')
		},
	})
	const taking = definePlugin({
		name: 'taking',
		manifest,
		changed: (changes) => calls.push(`changed ${changes.length}`),
		missed: () => calls.push('missed'),
	})
	const plugins = [failing.plugin(), taking.plugin()]
	const app = defineApp({ database, models: [Note], plugins, logger })
	await app.start()
	feed()?.changed([{ kind: 'insert', model: 'Note', ids: ['a'] }])
	feed()?.missed()
	expect(calls).toEqual(['changed 1', 'missed'])
	expect(errors).toEqual([
		[{ err: new Error('Broken.') }, "The plugin's changed failed."],
	])
	await app.stop()
})

it("runs a plugin's hooks outside the write that made the changes", async () => {
	let counted: Promise<number> | undefined
	const reading = definePlugin({
		name: 'reading',
		manifest,
		changed: () => {
			counted = Note.count({}, { as: master })
		},
	})
	const app = defineApp({
		database: memory(),
		models: [Note],
		plugins: [reading.plugin()],
		logger,
	})
	await app.start()
	await Note.create({ data: { text: 'a' } }, { as: master })
	await vi.waitFor(() => expect(counted).toBeDefined())
	expect(await counted).toBe(1)
	// Inside the write's transaction, the count would hold it open.
	await app.stop()
})
