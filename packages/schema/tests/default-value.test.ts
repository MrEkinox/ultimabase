import { describe, expect, it } from 'vitest'

import {
	DatabaseDefault,
	dateTimeField,
	getDefaultKind,
	isStaticDefault,
	stringField,
} from '../src/index.js'

describe('field defaults', () => {
	it('classifies defaults without invoking runtime factories', () => {
		let calls = 0
		const factory = (): string => {
			calls += 1

			return 'generated'
		}
		const database = new DatabaseDefault<string>('fixture.generated', {
			expression: 'generated_value()',
		})

		expect(getDefaultKind('static')).toBe('static')
		expect(getDefaultKind(factory)).toBe('runtime')
		expect(getDefaultKind(database)).toBe('database')
		expect(isStaticDefault('static')).toBe(true)
		expect(isStaticDefault(factory)).toBe(false)
		expect(isStaticDefault(database)).toBe(false)
		expect(calls).toBe(0)
	})

	it('preserves a runtime factory without executing it during declaration', () => {
		let calls = 0
		const factory = (): string => {
			calls += 1

			return '2026-07-30T12:00:00.000Z'
		}
		const field = dateTimeField({ default: factory })

		expect(field.options.default).toBe(factory)
		expect(getDefaultKind(field.options.default)).toBe('runtime')
		expect(calls).toBe(0)
	})

	it('copies and freezes adapter-owned database metadata', () => {
		const config = {
			expression: 'CURRENT_TIMESTAMP',
		}
		const database = new DatabaseDefault<
			string,
			{ readonly expression: string }
		>('postgres.currentTimestamp', config)
		const field = dateTimeField({ default: database })

		config.expression = 'changed'

		// Adapter configuration cannot be changed after entering schema metadata.
		expect(field.options.default).toBe(database)
		expect(database.config.expression).toBe('CURRENT_TIMESTAMP')
		expect(Object.isFrozen(database)).toBe(true)
		expect(Object.isFrozen(database.config)).toBe(true)
	})

	it('rejects an unnamed database default', () => {
		expect(
			() => new DatabaseDefault<string>('', { expression: 'invalid' }),
		).toThrow(new TypeError('Database default name cannot be empty'))
	})

	it('rejects invalid database metadata at runtime', () => {
		expect(() => {
			// Runtime validation rejects arrays even though JavaScript treats them as objects.
			new DatabaseDefault<string>('fixture.invalid', [])
		}).toThrow(new TypeError('Database default config must be an object'))
	})

	it('keeps static defaults backward compatible', () => {
		const field = stringField({ default: 'anonymous' })

		expect(field.options.default).toBe('anonymous')
		expect(getDefaultKind(field.options.default)).toBe('static')
	})
})
