// The logger without a `logger` option (D-58, D-88, D-93): one JSON line per
// entry, a readable line in a terminal.
import { stripVTControlCharacters } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asUser } from '@ultimabase/testing'
import { consoleLogger } from './console-logger.ts'
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

/** The lines written to `level`, without their colors. */
const written = (level: keyof typeof lines): string[] =>
	lines[level].mock.calls.map(([line]) => {
		if (typeof line !== 'string') throw new TypeError('A line is a string.')
		return stripVTControlCharacters(line)
	})
const time = String.raw`\d\d:\d\d:\d\d`

// Asymmetric matchers are typed `any`.
const aTime: unknown = expect.any(Number)
const containing = (fields: object): unknown => expect.objectContaining(fields)

const terminals = { stdout: process.stdout.isTTY, stderr: process.stderr.isTTY }
/** Makes stdout and stderr terminals, or not. */
const terminal = (stdout: boolean, stderr = stdout) => {
	process.stdout.isTTY = stdout
	process.stderr.isTTY = stderr
}

beforeEach(() => {
	for (const spy of Object.values(lines)) spy.mockClear()
	terminal(false)
})
afterEach(() => {
	terminal(terminals.stdout, terminals.stderr)
	vi.unstubAllEnvs()
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

describe('consoleLogger in a terminal', () => {
	it('writes the time, the level, the source, the message and the details', () => {
		terminal(true)
		const logger = consoleLogger().child({ name: 'cache' })
		logger.info({ size: 2, url: 'redis://a b', empty: '' }, 'Warm.')
		logger.warn({ ids: ['a'], missing: undefined }, 'Full.')
		consoleLogger().error('Down.')
		expect(written('info')).toEqual([
			expect.stringMatching(
				new RegExp(
					String.raw`^${time} INFO  \[cache\] Warm\. size=2 url="redis://a b" empty=""$`,
					'u',
				),
			),
		])
		expect(written('warn')).toEqual([
			expect.stringMatching(
				new RegExp(
					String.raw`^${time} WARN  \[cache\] Full\. ids=\["a"\] missing=undefined$`,
					'u',
				),
			),
		])
		expect(written('error')).toEqual([
			expect.stringMatching(
				new RegExp(String.raw`^${time} ERROR Down\.$`, 'u'),
			),
		])
	})

	it('writes each error as its stack, indented, under the line', () => {
		terminal(true)
		const err = new RangeError('Too far.')
		const bare = new TypeError('No stack.')
		delete bare.stack
		consoleLogger().error({ err, bare, model: 'Order' })
		const [line, ...stack] = written('error')[0]?.split('\n') ?? []
		expect(line).toMatch(
			new RegExp(String.raw`^${time} ERROR model=Order$`, 'u'),
		)
		expect(stack).toEqual([
			...(err.stack ?? '').split('\n').map((part) => `    ${part}`),
			'    TypeError: No stack.',
		])
	})

	it('colors the level when the terminal shows colors', () => {
		terminal(true)
		vi.stubEnv('FORCE_COLOR', '1')
		consoleLogger().warn('Careful.')
		expect(lines.warn.mock.calls[0]?.[0]).toContain('\u001B[33mWARN \u001B[39m')
	})

	it('chooses per stream: stdout for info, stderr for warn and error', () => {
		terminal(false, true)
		consoleLogger().info('Started.')
		consoleLogger().warn('Careful.')
		expect(entries('info')).toEqual([
			{ level: 'info', time: aTime, msg: 'Started.' },
		])
		expect(written('warn')).toEqual([
			expect.stringMatching(
				new RegExp(String.raw`^${time} WARN  Careful\.$`, 'u'),
			),
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

	it('writes ACCESS_DENIED to console.warn', async () => {
		const denied = Note.create(
			{ data: { text: 't' } },
			{ as: asUser({ id: 'ada' }) },
		)
		await expect(denied).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(entries('warn')).toEqual([
			containing({ level: 'warn', callerId: 'ada' }),
		])
	})
})
