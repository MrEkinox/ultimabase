import { describe, expect, it } from 'vitest'

import {
	Schema,
	SchemaRegistry,
	materializeSchemaModel,
} from '../schema/index.js'
import { assertImmutableOperationValue } from './plugin-operation-boundaries.js'

describe('plugin operation snapshot boundaries', () => {
	it('accepts persisted schema snapshots with native binary values', () => {
		const Record = Schema.define({
			className: 'OperationBinaryRecord',
			fields: (field) => ({ bytes: field.binary(), metadata: field.json() }),
		})
		new SchemaRegistry([Record]).resolveSchemaTargets()
		const model = materializeSchemaModel(Record, {
			id: '01991f00-0000-7000-8000-000000000101',
			bytes: new Uint8Array([1, 2]),
		})
		expect(() => {
			assertImmutableOperationValue(Object.freeze({ user: model }), 'result')
		}).not.toThrow()
		// A draft or a shaped object does not gain the persisted-model exception.
		expect(() => {
			assertImmutableOperationValue(
				new Record({ bytes: new Uint8Array([1]) }),
				'input',
			)
		}).toThrow('must be immutable')
		expect(() => {
			assertImmutableOperationValue(
				Object.freeze({ bytes: new Uint8Array([1]) }),
				'result',
			)
		}).toThrow('must be immutable')
		expect(() => {
			assertImmutableOperationValue({ user: model }, 'result')
		}).toThrow('must be immutable')
		const metadata = Object.freeze({ bytes: model.bytes })
		const aliased = materializeSchemaModel(Record, { metadata })
		expect(() => {
			assertImmutableOperationValue(
				Object.freeze({ user: model, bytes: model.bytes }),
				'result',
			)
		}).toThrow('must be immutable')
		expect(() => {
			assertImmutableOperationValue(
				Object.freeze({ user: aliased, metadata }),
				'result',
			)
		}).toThrow('must be immutable')
		expect(() => {
			assertImmutableOperationValue(
				materializeSchemaModel(Record, { metadata: {} }),
				'result',
			)
		}).toThrow('must be immutable')
	})

	it('keeps ordinary frozen trees and cycles valid', () => {
		const cycle: { self?: unknown } = {}
		cycle.self = cycle
		Object.freeze(cycle)
		expect(() => {
			assertImmutableOperationValue(
				Object.freeze({ items: Object.freeze([null, 1, cycle]) }),
				'result',
			)
		}).not.toThrow()
	})
})
