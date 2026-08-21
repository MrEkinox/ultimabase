import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import {
	bigintField,
	binaryField,
	dateField,
	dateTimeField,
	decimalField,
	floatField,
	intField,
	stringField,
	timeField,
	uuidField,
} from '../../index.js'

describe('built-in structural field options', () => {
	it('keeps defaults independent and immutable across scalar families', () => {
		const bytes = new Uint8Array([1, 2, 3])
		const fields = [
			stringField({ default: 'value' }),
			binaryField({ default: bytes }),
			intField({ default: 1 }),
			bigintField({ default: 1n }),
			floatField({ default: 1.5 }),
			decimalField({ default: '1.50' }),
			dateField({ default: '2026-08-21' }),
			dateTimeField({ default: '2026-08-21T12:00:00.000Z' }),
			timeField({ default: '12:00:00.000' }),
			uuidField({ default: '0198d1ae-a800-7000-8000-000000000001' }),
		]

		bytes[0] = 9
		expect(fields.every((field) => Object.isFrozen(field.options))).toBe(true)
		expect(fields[1]?.options.default).toStrictEqual(new Uint8Array([1, 2, 3]))
	})

	it('copies list and Buffer defaults without losing their logical values', () => {
		const bytes = Buffer.from([1, 2, 3])
		const byteList = [new Uint8Array([4]), Buffer.from([5])]
		const dates = ['2026-08-21']
		const binary = binaryField({ default: bytes })
		const binaries = binaryField({ default: byteList, list: true })
		const calendarDates = dateField({ default: dates, list: true })

		bytes[0] = 9
		byteList[0]?.fill(9)
		byteList[1]?.fill(9)
		dates[0] = '2030-01-01'

		expect(Buffer.isBuffer(binary.options.default)).toBe(true)
		expect(binary.options.default).toStrictEqual(Buffer.from([1, 2, 3]))
		expect(binaries.options.default).toStrictEqual([
			new Uint8Array([4]),
			Buffer.from([5]),
		])
		expect(calendarDates.options.default).toStrictEqual(['2026-08-21'])
		expect(Object.isFrozen(binaries.options.default)).toBe(true)
		expect(Object.isFrozen(calendarDates.options.default)).toBe(true)
	})

	it('retains runtime default factories without invoking them', () => {
		const factory = vi.fn(() => new Uint8Array([1]))
		const field = binaryField({ default: factory })

		expect(field.options.default).toBe(factory)
		expect(factory).not.toHaveBeenCalled()
	})

	it('retains direct presence, generation, timezone, and decimal shape', () => {
		const integer = intField({ autoIncrement: true, required: true })
		const date = dateField({ autoNow: true })
		const moment = dateTimeField({ timezone: false })
		const time = timeField({ timezone: true })
		const decimal = decimalField({ precision: 12, scale: 2 })

		expect(integer.options).toMatchObject({
			autoIncrement: true,
			required: true,
		})
		expect(date.options.autoNow).toBe(true)
		expect(moment.options.timezone).toBe(false)
		expect(time.options.timezone).toBe(true)
		expect(decimal.options).toMatchObject({ precision: 12, scale: 2 })
	})

	it('rejects invalid structural metadata independently from validators', () => {
		expect(() => decimalField({ precision: 0 })).toThrow(
			'precision must be a positive safe integer',
		)
		expect(() => decimalField({ precision: 2, scale: 3 })).toThrow(
			'scale cannot be greater than precision',
		)
		expect(() => dateField({ autoNow: true, list: true } as never)).toThrow(
			'autoNow cannot be used with list fields',
		)
		expect(() =>
			dateTimeField({
				autoNow: true,
				default: '2026-08-21T12:00:00.000Z',
			} as never),
		).toThrow('autoNow and default cannot both be configured')
	})

	it.each([
		['binary', () => binaryField({ default: 'bytes' } as never), 'Uint8Array'],
		['integer', () => intField({ default: 1.5 } as never), 'safe integer'],
		['bigint', () => bigintField({ default: 1 } as never), 'bigint'],
		['decimal', () => decimalField({ default: 'not-decimal' }), 'decimal'],
		['date', () => dateField({ default: '2026-02-30' }), 'calendar date'],
		[
			'date-time',
			() => dateTimeField({ default: 'not-a-date-time' }),
			'date-time',
		],
		['time', () => timeField({ default: '25:00:00.000' }), 'time'],
	] as const)('rejects an invalid %s default', (_name, declare, message) => {
		expect(declare).toThrow(message)
	})
})
