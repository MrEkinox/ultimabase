import { describe, expect, it } from 'vitest'

import { assertPortableRegexSource } from './portable-regex.js'

describe('portable regular-expression subset (ADR-0302)', () => {
	it.each([
		'^abc$',
		'a.c',
		'[a-z0-9_]+',
		'[^-a]',
		'[\\]\\-]',
		'\\d\\D\\w\\W\\s\\S',
		'(ab|cd)*',
		'(?:ab)+',
		'a{2}b{2,}c{2,4}',
		'colou?r',
		'\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$\\\\\\/',
		'',
	])('accepts %s', (source) => {
		expect(() => {
			assertPortableRegexSource(source, 'title')
		}).not.toThrow()
	})

	it.each([
		['(a)\\1', 'the escape \\1'],
		['(?=a)', 'lookaround or a named group'],
		['(?<!a)b', 'lookaround or a named group'],
		['(?<name>a)', 'lookaround or a named group'],
		['\\p{L}', 'the escape \\p'],
		['\\bword', 'the escape \\b'],
		['a*?', 'a quantifier without a target'],
		['a++', 'a quantifier without a target'],
		['*a', 'a quantifier without a target'],
		['a{x}', 'a malformed repetition'],
		['a{3,1}', 'an inverted repetition range'],
		['[[:alpha:]]', 'a POSIX bracket expression'],
		['[]a]', 'an empty bracket class'],
		['[abc', 'an unterminated bracket class'],
		['(ab', 'an unbalanced parenthesis'],
		['ab)', 'an unbalanced parenthesis'],
		['a]', 'an unescaped ]'],
		['abc\\', 'a trailing backslash'],
	])('rejects %s with a public validation error', (source, construct) => {
		expect(() => {
			assertPortableRegexSource(source, 'title')
		}).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				publicDetails: { field: 'title', operator: 'matches' },
				publicMessage: `The regular expression on title uses ${construct}, which is not supported.`,
			}),
		)
	})
})
