// The logger without a `logger` option (D-58, D-88): one JSON line per entry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consoleLogger } from './console-logger.ts'
import type { Caller } from './index.ts'
import { defineApp, defineModel, memory } from './index.ts'

const lines = {
	info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
	warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
	error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
}
const entries = (level: keyof typeof lines): unknown[] =>
	lines[level].mock.calls.map(([line]) => {
		if (typeof line !== 'string') throw new TypeError('A line is a string.')
		const entry: unknown = JSON.parse(line)
		return entry
	})

// Asymmetric matchers are typed `any`.
const aTime: unknown = expect.any(Number)
const containing = (fields: object): unknown => expect.objectContaining(fields)

// The kernel reads only the user's id.
const isCaller = (value: unknown): value is Caller =>
	typeof value === 'object' && value !== null

beforeEach(() => {
	for (const spy of Object.values(lines)) spy.mockClear()
})

describe('consoleLogger', () => {
	it('writes the level, the time, the fields and the message', () => {
		consoleLogger().info({ id: 1 }, 'Started.')
		consoleLogger().warn('Careful.')
		expect(entries('info')).toEqual([
			{ level: 'info', time: aTime, id: 1, msg: 'Started.' },
		])
		expect(entries('warn')).toEqual([
			{ level: 'warn', time: aTime, msg: 'Careful.' },
		])
	})

	it('writes an error as its type, message and stack', () => {
		const err = new RangeError('Too far.')
		consoleLogger().error({ err })
		expect(entries('error')).toEqual([
			{
				level: 'error',
				time: aTime,
				err: { type: 'RangeError', message: 'Too far.', stack: err.stack },
			},
		])
	})

	it("adds a child's bindings to its parent's", () => {
		consoleLogger({ app: 'a' }).child({ request: 'r' }).info('Done.')
		expect(entries('info')).toEqual([
			containing({ app: 'a', request: 'r', msg: 'Done.' }),
		])
	})
})

describe('an application without a logger', () => {
	const Note = defineModel({
		name: 'Note',
		fields: (f) => ({ text: f.string() }),
	})
	const app = defineApp({ database: memory(), models: [Note] })
	beforeEach(async () => {
		await app.start()
	})
	afterEach(async () => {
		await app.stop()
	})

	const as: unknown = { kind: 'user', user: { id: 'ada' } }

	it('writes ACCESS_DENIED to console.warn', async () => {
		if (!isCaller(as)) throw new Error('A caller is an object.')
		const denied = Note.create({ data: { text: 't' } }, { as })
		await expect(denied).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(entries('warn')).toEqual([
			containing({ level: 'warn', callerId: 'ada' }),
		])
	})
})
