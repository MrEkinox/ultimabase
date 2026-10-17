import { describe, expect, it } from 'vitest'

import { definePluginOptionsParser } from './plugin-options.js'

// Plugin authors may pass any Standard Schema implementation, or write
// JavaScript: the parser names every malformed piece instead of guessing.
const defineUntyped = (definition: unknown): unknown =>
	Reflect.apply(definePluginOptionsParser, undefined, [definition])

const callParser = (parser: unknown, input: unknown): unknown => {
	if (typeof parser !== 'function') throw new TypeError('Expected a parser')
	return Reflect.apply(parser, undefined, [input])
}

/** Parses with a synchronous validator answering `result` for every input. */
const parseWith =
	(result: unknown) =>
	(input: unknown): unknown =>
		callParser(
			defineUntyped({
				name: 'fixture options',
				schema: {
					'~standard': {
						vendor: 'fixture',
						version: 1,
						validate: () => result,
					},
				},
			}),
			input,
		)

describe('definePluginOptionsParser with a Standard Schema', () => {
	it.for([
		['an object schema', null],
		[
			'version 1',
			{ '~standard': { version: 2, vendor: 'x', validate: () => undefined } },
		],
		['a vendor', { '~standard': { version: 1, validate: () => undefined } }],
		['a validate function', { '~standard': { version: 1, vendor: 'x' } }],
	] as const)('requires %s', ([, schema]) => {
		expect(() => {
			defineUntyped({ name: 'fixture options', schema })
		}).toThrow('plugin options parser schema must implement Standard Schema V1')
	})

	it('accepts a validator implemented as a function object', () => {
		const schema = Object.assign(() => undefined, {
			'~standard': {
				vendor: 'fixture',
				version: 1,
				validate: (value: unknown) => ({ value }),
			},
		})
		const parse = defineUntyped({ name: 'fixture options', schema })
		expect(typeof parse).toBe('function')
	})

	it('refuses results that are not Standard Schema results', () => {
		expect(() => parseWith(null)({})).toThrow(
			'fixture options schema returned an invalid Standard Schema result',
		)
		expect(() => parseWith({ issues: 'bad' })({})).toThrow(
			'fixture options schema returned an invalid Standard Schema result',
		)
		expect(() => parseWith({ value: ['not', 'a', 'record'] })({})).toThrow(
			'fixture options schema must return a plain object',
		)
	})

	it('formats each issue with its path, or its message alone', () => {
		const parse = parseWith({
			issues: [
				{ message: 'is required', path: [] },
				{ message: 'must be a string', path: [{ key: 'labels' }, 0] },
				{ message: 'has no readable path', path: [{ key: {} }] },
				{ message: 'is malformed', path: 'mode' },
				{ path: ['mode'] },
				'not an issue',
			],
		})
		expect(() => parse({})).toThrow(
			new TypeError(
				'fixture options validation failed: is required; labels.0: must be a string; has no readable path; is malformed; invalid Standard Schema issue; invalid Standard Schema issue',
			),
		)
	})

	it('reports an empty issue list without details', () => {
		expect(() => parseWith({ issues: [] })({})).toThrow(
			new TypeError('fixture options validation failed'),
		)
	})
})

describe('definePluginOptionsParser with keys and a normalizer', () => {
	it.for([
		[
			'a key array',
			{ name: 'fixture options', keys: 'mode', normalize: () => ({}) },
			'plugin options parser keys must be an array',
		],
		[
			'a normalize function',
			{ name: 'fixture options', keys: [], normalize: {} },
			'plugin options parser normalize must be a function',
		],
		[
			'a formatUnknownKey function',
			{
				name: 'fixture options',
				keys: [],
				normalize: () => ({}),
				formatUnknownKey: 'Unknown key',
			},
			'plugin options parser formatUnknownKey must be a function',
		],
		[
			'non-empty keys',
			{ name: 'fixture options', keys: [''], normalize: () => ({}) },
			'plugin options parser keys[0]',
		],
		[
			'a name',
			{ name: '', keys: [], normalize: () => ({}) },
			'plugin options parser name',
		],
	] as const)('requires %s', ([, definition, message]) => {
		expect(() => {
			defineUntyped(definition)
		}).toThrow(message)
	})

	it('refuses symbol keys and falls back when the formatter answers no text', () => {
		const parser = defineUntyped({
			formatUnknownKey: () => undefined,
			keys: ['mode'],
			name: 'fixture options',
			normalize: ({ mode }: { mode?: unknown }) => ({ mode }),
		})
		const parse = (input: unknown) => callParser(parser, input)
		expect(() => parse({ [Symbol('hidden')]: true })).toThrow(
			'Unknown fixture options key: Symbol(hidden)',
		)
		expect(() => parse({ other: true })).toThrow(
			'Unknown fixture options key: other',
		)
		expect(parse({ mode: 'review' })).toStrictEqual({ mode: 'review' })
	})
})
