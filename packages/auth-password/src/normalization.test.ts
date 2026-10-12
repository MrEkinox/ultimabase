import { describe, expect, it } from 'vitest'

import {
	normalizeEmail,
	normalizePassword,
	normalizeUsername,
} from './normalization.js'

describe('password() input normalization', () => {
	it('creates one canonical locale-independent username representation', () => {
		expect(normalizeUsername('\u0085  ＡdA.LOVELACE  \u0085')).toBe(
			'ada.lovelace',
		)
		expect(normalizeUsername('a..b')).toBe('a..b')
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
		expect(() => normalizeUsername(username)).toThrow(TypeError)
		try {
			normalizeUsername(username)
		} catch (error: unknown) {
			expect(String(error)).not.toContain(username)
		}
	})

	it('creates one lowercase email representation and checks its format', () => {
		expect(normalizeEmail('  Ada.Lovelace@Example.TEST ')).toBe(
			'ada.lovelace@example.test',
		)
		for (const email of [
			'ada',
			'ada@example',
			'a da@example.test',
			'ada@@example.test',
			`${'a'.repeat(65)}@example.test`,
			`ada@${'a'.repeat(250)}.test`,
		]) {
			expect(() => normalizeEmail(email), email).toThrow(
				'email must be a valid email address',
			)
		}
	})

	it('normalizes passwords once without trimming or changing case', () => {
		const password = '  Correct Horsé Battery  '
		expect(normalizePassword(password)).toBe('  Correct Horsé Battery  ')
	})

	it('counts password Unicode code points and validates well-formed input', () => {
		expect(normalizePassword('🔐'.repeat(15))).toBe('🔐'.repeat(15))
		expect(() => normalizePassword('a'.repeat(14))).toThrow(
			'between 15 and 256 Unicode code points',
		)
		expect(() => normalizePassword('a'.repeat(257))).toThrow(
			'between 15 and 256 Unicode code points',
		)
		expect(() =>
			normalizePassword(`password-value${String.fromCharCode(0xd800)}`),
		).toThrow('well-formed Unicode')
	})
})
