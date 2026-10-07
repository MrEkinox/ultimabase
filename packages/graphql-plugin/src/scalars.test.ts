import { describe, expect, it } from 'vitest'
import { pointerField, UltimaBase } from '@ultimabase/core'
import { GraphQLID } from 'graphql'

import {
	GraphqlBase64,
	GraphqlBigInt,
	GraphqlDate,
	GraphqlDateTime,
	GraphqlDecimal,
	GraphqlJSON,
	GraphqlSafeInt,
	GraphqlTime,
	GraphqlUUID,
} from './scalars.js'
import { readGraphqlScalarInputType } from './scalar-types.js'

describe('GraphQL scalar contracts', () => {
	it('keeps safe integers and big integers lossless', () => {
		expect(GraphqlSafeInt.coerceInputValue(Number.MAX_SAFE_INTEGER)).toBe(
			Number.MAX_SAFE_INTEGER,
		)
		expect(() =>
			GraphqlSafeInt.coerceInputValue(Number.MAX_SAFE_INTEGER + 1),
		).toThrow()
		expect(GraphqlBigInt.coerceInputValue('9007199254740993')).toBe(
			9_007_199_254_740_993n,
		)
		expect(GraphqlBigInt.coerceOutputValue(9_007_199_254_740_993n)).toBe(
			'9007199254740993',
		)
		expect(() => GraphqlBigInt.coerceInputValue('01')).toThrow()
	})

	it('accepts only canonical decimal and temporal strings', () => {
		expect(GraphqlDecimal.coerceInputValue('-12.50')).toBe('-12.50')
		expect(GraphqlDate.coerceInputValue('2024-02-29')).toBe('2024-02-29')
		expect(GraphqlTime.coerceInputValue('08:30:00.000Z')).toBe('08:30:00.000Z')
		expect(GraphqlDateTime.coerceInputValue('2024-02-29T08:30:00.000Z')).toBe(
			'2024-02-29T08:30:00.000Z',
		)
		expect(() => GraphqlDecimal.coerceInputValue('-0')).toThrow()
		expect(() => GraphqlDate.coerceInputValue('2023-02-29')).toThrow()
		expect(() =>
			GraphqlDateTime.coerceInputValue('2024-02-29T08:30:00Z'),
		).toThrow()
	})

	it('validates UUID, padded base64, and immutable JSON values', () => {
		const uuid = '0198f090-2a50-7000-8000-000000000034'
		expect(GraphqlUUID.coerceInputValue(uuid)).toBe(uuid)
		expect(GraphqlBase64.coerceInputValue('AQID')).toStrictEqual(
			new Uint8Array([1, 2, 3]),
		)
		expect(GraphqlBase64.coerceOutputValue(new Uint8Array([4]))).toBe('BA==')
		const json = GraphqlJSON.coerceInputValue({ nested: [1, true, null] })

		expect(json).toStrictEqual({ nested: [1, true, null] })
		expect(Object.isFrozen(json)).toBe(true)
		expect(() => GraphqlUUID.coerceInputValue('not-a-uuid')).toThrow()
		expect(() => GraphqlBase64.coerceInputValue('AQI')).toThrow()
		expect(() => GraphqlJSON.coerceInputValue(new Date())).toThrow()
	})

	it('uses GraphQL ID for pointer scalar inputs', () => {
		const Target = UltimaBase.Schema.define({
			className: 'GraphqlScalarPointerTarget',
			fields: () => ({}),
		})

		expect(
			readGraphqlScalarInputType(pointerField({ target: () => Target })),
		).toBe(GraphQLID)
	})
})
