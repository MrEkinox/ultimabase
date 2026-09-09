import {
	Pointer,
	Schema,
	SchemaRegistry,
	definePluginField,
	materializeSchemaModel,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { restFieldCodec } from './field-codecs.js'
import {
	encodeRestJsonValue,
	encodeRestSchemaResult,
} from './response-values.js'
import { createRestSchemaSuccessResponse } from './http-handler.js'
import type {
	RestSchemaOperation,
	RestSchemaRouteDefinition,
} from './routes.js'

const authorId = '01991f00-0000-7000-8000-000000000101'
const recordId = '01991f00-0000-7000-8000-000000000102'
const invalid = (): Error => new TypeError('Unrepresentable REST value')
const schemaRoute = (
	operation: RestSchemaOperation,
): RestSchemaRouteDefinition =>
	({ operation }) as unknown as RestSchemaRouteDefinition

const portableCode = definePluginField(
	'fixture.response-code',
	{},
	{
		snapshotValue: (value, path): string => {
			if (typeof value !== 'string')
				throw new TypeError(`${path} must be a string`)
			return value
		},
		wireCodecs: [
			restFieldCodec({
				decode: (value): string => String(value),
				encode: (value) => ({ code: value.toLowerCase() }),
			}),
		],
	},
)

const ResponseAuthor = Schema.define({
	className: 'RestResponseAuthor',
	fields: (field) => ({ name: field.string() }),
})

const ResponseRecord = Schema.define({
	className: 'RestResponseRecord',
	fields: (field) => ({
		active: field.boolean(),
		amount: field.decimal(),
		author: field.pointer({ target: 'RestResponseAuthor' }),
		blob: field.binary(),
		calendar: field.date(),
		clock: field.time(),
		code: portableCode,
		count: field.int(),
		huge: field.bigint(),
		metadata: field.json(),
		moment: field.dateTime(),
		note: field.string(),
		payload: field.object({
			fields: (nested) => ({
				bytes: nested.binary(),
				sequence: nested.bigint(),
			}),
		}),
		related: field.relation({ target: 'RestResponseAuthor' }),
		reviewer: field.pointer({ target: 'RestResponseAuthor' }),
		score: field.float(),
		tags: field.string({ list: true }),
		uid: field.uuid(),
	}),
})

const VirtualResponseRecord = Schema.define({
	className: 'RestVirtualResponseRecord',
	fields: (field) => ({
		seed: field.string(),
		virtualValues: field.virtual({
			output: (output) =>
				output.object({
					nullable: false,
					fields: (nested) => ({
						active: nested.boolean({ nullable: false }),
						amount: nested.decimal({ nullable: false }),
						blob: nested.binary({ nullable: false }),
						calendar: nested.date({ nullable: false }),
						clock: nested.time({ nullable: false }),
						count: nested.int({ nullable: false }),
						huge: nested.bigint({ nullable: false }),
						metadata: nested.json({ nullable: false }),
						moment: nested.dateTime({ nullable: false }),
						note: nested.string(),
						score: nested.float({ nullable: false }),
						status: nested.enum({
							nullable: false,
							values: ['ready', 'done'],
						}),
						tags: nested.string({ list: true, nullable: false }),
						uid: nested.uuid({ nullable: false }),
					}),
				}),
			resolve: () => ({
				active: true,
				amount: '123.450',
				blob: Uint8Array.from([1, 2, 3]),
				calendar: '2026-09-05',
				clock: '12:34:56.789Z',
				count: 7,
				huge: 9_007_199_254_740_993n,
				metadata: { nested: true },
				moment: '2026-09-05T12:34:56.789Z',
				note: null,
				score: 1.5,
				status: 'ready',
				tags: ['one', 'two'],
				uid: '01890f47-79c7-7a2b-8c09-9b87390b9d45',
			}),
			select: { seed: true },
		}),
	}),
})

new SchemaRegistry([ResponseAuthor, ResponseRecord]).resolveSchemaTargets()

describe('REST response values', () => {
	it('applies the complete schema operation status and envelope matrix', async () => {
		const model = materializeSchemaModel(ResponseRecord, { id: recordId })
		const cases: readonly Readonly<{
			body: unknown
			operation: RestSchemaOperation
			result: unknown
			status: number
		}>[] = [
			{
				body: { results: [{ id: recordId }] },
				operation: 'find',
				result: [model],
				status: 200,
			},
			{ body: { result: null }, operation: 'first', result: null, status: 200 },
			{
				body: { result: { id: recordId } },
				operation: 'get',
				result: model,
				status: 200,
			},
			{ body: { count: 4 }, operation: 'count', result: 4, status: 200 },
			{
				body: { exists: true },
				operation: 'exists',
				result: true,
				status: 200,
			},
			{
				body: { result: { id: recordId } },
				operation: 'create',
				result: model,
				status: 201,
			},
			{
				body: { result: { id: recordId } },
				operation: 'update',
				result: model,
				status: 200,
			},
			{
				body: { result: { id: recordId } },
				operation: 'delete',
				result: model,
				status: 200,
			},
			{
				body: { result: { id: recordId } },
				operation: 'upsert',
				result: model,
				status: 200,
			},
			{
				body: { results: [{ id: recordId }] },
				operation: 'bulkCreate',
				result: [model],
				status: 201,
			},
			{
				body: { results: [{ id: recordId }] },
				operation: 'bulkUpdate',
				result: [model],
				status: 200,
			},
			{
				body: { results: [{ id: recordId }] },
				operation: 'bulkDelete',
				result: [model],
				status: 200,
			},
			{
				body: { results: [{ id: recordId }] },
				operation: 'bulkUpsert',
				result: [model],
				status: 200,
			},
		]

		for (const item of cases) {
			const response = createRestSchemaSuccessResponse(
				schemaRoute(item.operation),
				ResponseRecord,
				item.result,
			)
			expect(response.status).toBe(item.status)
			expect(await response.json()).toStrictEqual(item.body)
		}
		expect(() =>
			createRestSchemaSuccessResponse(
				schemaRoute('update'),
				ResponseRecord,
				null,
			),
		).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
	})

	it('encodes every built-in shape recursively while preserving absence', () => {
		const author = materializeSchemaModel(ResponseAuthor, {
			id: authorId,
			name: 'Ada',
		})
		const result = materializeSchemaModel(ResponseRecord, {
			active: true,
			amount: '123.450',
			author,
			blob: Uint8Array.from([1, 2, 3]),
			calendar: '2026-09-05',
			clock: '12:34:56.789Z',
			code: 'READY',
			count: 7,
			huge: 9_007_199_254_740_993n,
			id: recordId,
			metadata: { type: 'pointer', untouched: true },
			moment: '2026-09-05T12:34:56.789Z',
			payload: { bytes: Uint8Array.from([4]), sequence: 12n },
			related: [author],
			reviewer: new Pointer(ResponseAuthor, authorId),
			score: 1.5,
			tags: ['one', 'two'],
			uid: '01890f47-79c7-7a2b-8c09-9b87390b9d45',
		})

		expect(
			encodeRestSchemaResult(ResponseRecord, result, invalid),
		).toStrictEqual({
			active: true,
			amount: '123.450',
			author: { id: authorId, name: 'Ada' },
			blob: { data: 'AQID', encoding: 'base64', type: 'binary' },
			calendar: '2026-09-05',
			clock: '12:34:56.789Z',
			code: { code: 'ready' },
			count: 7,
			huge: '9007199254740993',
			id: recordId,
			metadata: { type: 'pointer', untouched: true },
			moment: '2026-09-05T12:34:56.789Z',
			payload: {
				bytes: { data: 'BA==', encoding: 'base64', type: 'binary' },
				sequence: '12',
			},
			related: [{ id: authorId, name: 'Ada' }],
			reviewer: {
				className: 'RestResponseAuthor',
				id: authorId,
				type: 'pointer',
			},
			score: 1.5,
			tags: ['one', 'two'],
			uid: '01890f47-79c7-7a2b-8c09-9b87390b9d45',
		})
		expect(
			encodeRestSchemaResult(ResponseRecord, result, invalid),
		).not.toHaveProperty('note')
	})

	it('encodes virtual output descriptors through canonical REST values', () => {
		const result = materializeSchemaModel(VirtualResponseRecord, {
			id: recordId,
			virtualValues: {
				active: true,
				amount: '123.450',
				blob: Uint8Array.from([1, 2, 3]),
				calendar: '2026-09-05',
				clock: '12:34:56.789Z',
				count: 7,
				huge: 9_007_199_254_740_993n,
				metadata: { nested: true },
				moment: '2026-09-05T12:34:56.789Z',
				note: null,
				score: 1.5,
				status: 'ready',
				tags: ['one', 'two'],
				uid: '01890f47-79c7-7a2b-8c09-9b87390b9d45',
			},
		})

		expect(
			encodeRestSchemaResult(VirtualResponseRecord, result, invalid),
		).toStrictEqual({
			id: recordId,
			virtualValues: {
				active: true,
				amount: '123.450',
				blob: { data: 'AQID', encoding: 'base64', type: 'binary' },
				calendar: '2026-09-05',
				clock: '12:34:56.789Z',
				count: 7,
				huge: '9007199254740993',
				metadata: { nested: true },
				moment: '2026-09-05T12:34:56.789Z',
				note: null,
				score: 1.5,
				status: 'ready',
				tags: ['one', 'two'],
				uid: '01890f47-79c7-7a2b-8c09-9b87390b9d45',
			},
		})
	})

	it('rejects undefined, non-finite, cyclic, and unsafe integer output', () => {
		expect(() => encodeRestJsonValue({ value: undefined }, invalid)).toThrow(
			'Unrepresentable REST value',
		)
		expect(() => encodeRestJsonValue({ value: Number.NaN }, invalid)).toThrow(
			'Unrepresentable REST value',
		)
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		expect(() => encodeRestJsonValue(cyclic, invalid)).toThrow(
			'Unrepresentable REST value',
		)
		const result = materializeSchemaModel(ResponseRecord, {
			count: Number.MAX_SAFE_INTEGER + 1,
		})
		expect(() =>
			encodeRestSchemaResult(ResponseRecord, result, invalid),
		).toThrow('Unrepresentable REST value')
	})
})
