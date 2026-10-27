// testApplication (D-130): the application as declared, on a new memory() and
// a free port per test, quiet, stopped after each test.
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Logger, Migrations, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import { scratchable } from 'ultimabase/internal'
import { beforeAll, describe, expect, it } from 'vitest'
import { testApplication } from './index.ts'

const M = { as: master }
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

/** The database the application declares, which its tests never open. */
const declared = (): Adapter => ({
	...memory(),
	start: async () => Promise.reject(new Error('The declared database opened.')),
})

const thrown = (read: () => unknown): string => {
	try {
		return String(read())
	} catch (error) {
		return error instanceof Error ? error.message : 'not an Error'
	}
}

const levels: string[] = []
const recorder: Logger = {
	info: () => {
		levels.push('info')
	},
	warn: () => {
		levels.push('warn')
	},
	error: () => {
		levels.push('error')
	},
	child: () => recorder,
}

describe('an application with httpPlugin()', () => {
	const running = testApplication(
		defineApp({
			database: declared(),
			plugins: [httpPlugin()],
			models: [Note],
			logger: recorder,
		}),
	)
	// Read as the file is collected, before any test.
	const early = thrown(() => running.url)

	it('serves on a free port, without info lines', async () => {
		expect(running.url).toMatch(/^http:\/\/localhost:\d+$/u)
		expect(running.url).not.toBe('http://localhost:3000')
		expect((await fetch(`${running.url}/nothing`)).status).toBe(404)
		expect(levels).not.toContain('info')
		expect(process.env['PORT']).toBeUndefined()
		expect(early).toMatch('read during a test')
	})

	it('starts on a new memory() before each test', async () => {
		expect(await Note.count({}, M)).toBe(0)
		await Note.create({ data: { text: 'one' } }, M)
		expect(await Note.count({}, M)).toBe(1)
	})

	it('and on another one next', async () => {
		expect(await Note.count({}, M)).toBe(0)
	})
})

describe('PORT', () => {
	beforeAll(() => {
		process.env['PORT'] = '1'
		return () => {
			delete process.env['PORT']
		}
	})
	const running = testApplication(
		defineApp({ database: memory(), plugins: [httpPlugin()], models: [Note] }),
	)

	it('is 0 while the application starts, then is put back', () => {
		expect(running.url).not.toBe('http://localhost:1')
		expect(process.env['PORT']).toBe('1')
	})
})

describe('an application without httpPlugin()', () => {
	const running = testApplication(
		defineApp({ database: memory(), models: [Note] }),
	)

	it('has no url', async () => {
		expect(() => running.url).toThrow('add httpPlugin() to the application')
		expect(await Note.count({}, M)).toBe(0)
	})
})

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly api: object
}
const manifest = {
	name: 'fake-http',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
describe.each([
	['no url', {}],
	['a url that is not a function', { url: 'http://localhost:1' }],
	['a url that returns no text', { url: () => 1 }],
])('an http API with %s', (_, api) => {
	const fake = definePlugin<Http>({ name: 'http', manifest, api: () => api })
	const running = testApplication(
		defineApp({ database: memory(), plugins: [fake.plugin()], models: [Note] }),
	)

	it('has no url', () => {
		expect(() => running.url).toThrow('add httpPlugin()')
	})
})

it('takes only the value defineApp returned', () => {
	expect(() => testApplication({ start: () => undefined })).toThrow(
		'testApplication takes the value defineApp returned.',
	)
})

describe("{ database: 'declared' } on memory()", () => {
	const database = memory()
	testApplication(defineApp({ database, models: [Note] }), {
		database: 'declared',
	})

	it('starts it empty before each test', async () => {
		expect(await Note.count({}, M)).toBe(0)
		await Note.create({ data: { text: 'one' } }, M)
	})

	it('and empty again next', async () => {
		expect(await Note.count({}, M)).toBe(0)
		expect(await database.count({ model: 'Note' })).toBe(0)
	})
})

const migrations: Migrations = {
	snapshot: () => ({}),
	plan: () => [],
	stored: async () => undefined,
	apply: async () => undefined,
	reset: async () => [],
}
const events: string[] = []

describe("{ database: 'declared' } on a database with tables", () => {
	const database = scratchable({ ...memory(), migrations }, () => {
		events.push('scratch')
		return {
			drop: async () => {
				events.push('drop')
			},
		}
	})
	testApplication(defineApp({ database, models: [Note] }), {
		database: 'declared',
	})

	it('runs on tables of the file', () => {
		expect(events).toEqual(['scratch'])
	})

	it('of the whole file', () => {
		expect(events).toEqual(['scratch'])
	})
})

describe('after the file', () => {
	it('drops its tables', () => {
		expect(events).toEqual(['scratch', 'drop'])
	})
})

it('takes a declared database with tables only when it gives a file its own', () => {
	const database: Adapter = { ...memory(), migrations }
	expect(() =>
		testApplication(defineApp({ database, models: [Note] }), {
			database: 'declared',
		}),
	).toThrow("remove { database: 'declared' }")
})
