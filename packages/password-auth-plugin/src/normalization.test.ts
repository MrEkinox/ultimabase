import { describe, expect, it } from 'vitest'

import {
	normalizePasswordInput,
	normalizePasswordUsername,
} from './normalization.js'

describe('Password Auth input normalization', () => {
	it('creates one canonical locale-independent username representation', () => {
		expect(normalizePasswordUsername('\u0085  ＡdA.LOVELACE  \u0085')).toBe(
			'ada.lovelace',
		)
		expect(normalizePasswordUsername('a..b')).toBe('a..b')
	})

	it.each([
		'ab',
		`${'a'.repeat(64)}b`,
		'-alice',
		'alice-',
		'alice@example.com',
		'al ice',
		`al${String.fromCharCode(0xd800)}ice`,
	])('rejects invalid usernames without echoing their value', (username) => {
		expect(() => normalizePasswordUsername(username)).toThrow(TypeError)
		try {
			normalizePasswordUsername(username)
		} catch (error: unknown) {
			expect(String(error)).not.toContain(username)
		}
	})

	it('normalizes passwords once without trimming or changing case', () => {
		const password = '  Correct Horse\u0301 Battery  '
		expect(normalizePasswordInput(password)).toBe('  Correct Horsé Battery  ')
	})

	it('counts password Unicode code points and validates well-formed input', () => {
		expect(normalizePasswordInput('🔐'.repeat(15))).toBe('🔐'.repeat(15))
		expect(() => normalizePasswordInput('a'.repeat(14))).toThrow(
			'between 15 and 256 Unicode code points',
		)
		expect(() => normalizePasswordInput('a'.repeat(257))).toThrow(
			'between 15 and 256 Unicode code points',
		)
		expect(() =>
			normalizePasswordInput(`password-value${String.fromCharCode(0xd800)}`),
		).toThrow('well-formed Unicode')
	})
})
