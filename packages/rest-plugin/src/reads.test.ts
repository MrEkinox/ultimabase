import {
	Pointer,
	Schema,
	SchemaRegistry,
	definePluginField,
	normalizeReadOperation,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	normalizeRestReadRequest,
	restFieldCodec,
	restReadErrorCodes,
} from './index.js'

const authorId = '01991f00-0000-7000-8000-000000000001'
const recordId = '01991f00-0000-7000-8000-000000000002'

const portableCode = definePluginField(
	'fixture.portable-code',
	{},
	{
		snapshotValue: (value, path): string => {
			if (typeof value !== 'string' || value !== value.toUpperCase()) {
				throw new TypeError(`${path} must be an uppercase code`)
			}
			return value
		},
		storageCodec: {
			decode: (value): string => {
				if (
					typeof value !== 'object' ||
					value === null ||
					!('stored' in value) ||
					typeof value.stored !== 'string'
				) {
					throw new TypeError('stored code must be an object string')
				}
				return value.stored
			},
			encode: (value) => ({ stored: value }),
			format: 'json',
			version: 1,
		},
		wireCodecs: [
			restFieldCodec({
				decode: (value): string => {
					if (
						typeof value !== 'object' ||
						value === null ||
						!('code' in value) ||
						typeof value.code !== 'string'
					) {
						throw new TypeError('code must be an object string')
					}
					return value.code.toUpperCase()
				},
				encode: (value) => ({ code: value.toLowerCase() }),
			}),
		],
	},
)

const Author = Schema.define({
	className: 'RestReadAuthor',
	fields: (field) => ({ name: field.string() }),
})

const RecordSchema = Schema.define({
	className: 'RestReadRecord',
	fields: (field) => ({
		active: field.boolean(),
		amount: field.decimal(),
		author: field.pointer({ target: 'RestReadAuthor' }),
		blob: field.binary(),
		calendar: field.date(),
		clock: field.time(),
		count: field.int(),
		huge: field.bigint(),
		metadata: field.json(),
		moment: field.dateTime(),
		name: field.string(),
		nickname: field.string(),
		payload: field.object({
			fields: (nested) => ({
				nestedBlob: nested.binary(),
				nestedHuge: nested.bigint(),
			}),
		}),
		portableCode,
		related: field.relation({ target: 'RestReadAuthor' }),
		score: field.float(),
		status: field.enum({ values: ['draft', 'live'] }),
		tags: field.string({ list: true }),
		uid: field.uuid(),
	}),
})

new SchemaRegistry([Author, RecordSchema]).resolveSchemaTargets()

const binaryWire = { data: 'AQID', encoding: 'base64', type: 'binary' }
const pointerWire = {
	className: 'RestReadAuthor',
	id: authorId,
	type: 'pointer',
}
const wireWhere = {
	active: { eq: true },
	amount: { eq: '123.45' },
	author: { eq: pointerWire },
	blob: { eq: binaryWire },
	calendar: { eq: '2026-09-05' },
	clock: { eq: '12:34:56.000' },
	count: { gte: 2 },
	huge: { eq: '9007199254740993' },
	metadata: { contains: { type: 'binary', arbitrary: true } },
	moment: { eq: '2026-09-05T12:34:56.000Z' },
	name: { startsWith: 'A' },
	nickname: { eq: null },
	payload: { contains: { nestedHuge: '7' } },
	portableCode: { eq: { code: 'blue' } },
	related: { some: { name: { contains: 'B' } } },
	score: { lt: 4.5 },
	status: { in: ['draft', 'live'] },
	tags: { hasSome: ['one', 'two'] },
	uid: { eq: recordId },
}
const logicalWhere = {
	...wireWhere,
	author: { eq: authorId },
	blob: { eq: Uint8Array.from([1, 2, 3]) },
	huge: { eq: 9_007_199_254_740_993n },
	payload: { contains: { nestedHuge: 7n } },
	portableCode: { eq: 'BLUE' },
}

const jsonRequest = (
	url: string,
	value: unknown,
	headers?: Readonly<Record<string, string>>,
) =>
	new Request(url, {
		body: JSON.stringify(value),
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
		method: 'POST',
	})

describe('REST read normalization', () => {
	it('makes simple GET, complex POST, and direct Core inputs produce one AST', async () => {
		const input = {
			include: {
				author: { select: { id: true, name: true } },
				related: {
					limit: 5,
					select: { name: true },
					where: { name: { startsWith: 'R' } },
				},
			},
			limit: 20,
			offset: 4,
			orderBy: { createdAt: 'desc', name: 'asc' },
			select: { id: true, name: true },
			where: wireWhere,
		}
		const direct = normalizeReadOperation(RecordSchema, 'find-many', {
			...input,
			where: logicalWhere,
		})
		const post = await normalizeRestReadRequest(RecordSchema, {
			operation: 'find',
			request: jsonRequest('https://example.test/query', input),
		})
		const query = new URLSearchParams({
			include: JSON.stringify(input.include),
			limit: '20',
			offset: '4',
			orderBy: '-createdAt,name',
			select: 'id,name',
			where: JSON.stringify(wireWhere),
		})
		const get = await normalizeRestReadRequest(RecordSchema, {
			operation: 'find',
			request: new Request(`https://example.test/records?${query.toString()}`),
		})

		expect(post).toStrictEqual(direct)
		expect(get).toStrictEqual(direct)
		expect(Object.isFrozen(get)).toBe(true)
		expect(get.query.where?.expression).toBeDefined()
		expect(
			JSON.stringify(get, (_key, value: unknown) =>
				typeof value === 'bigint' ? value.toString() : value,
			),
		).not.toMatch(/headers|https:\/\/|request|url/iu)
	})

	it('preserves exact count, exists, first, and UUID-v7 get operations', async () => {
		const count = await normalizeRestReadRequest(RecordSchema, {
			operation: 'count',
			request: new Request(
				`https://example.test/count?where=${encodeURIComponent(JSON.stringify({ active: { eq: true } }))}`,
			),
		})
		const exists = await normalizeRestReadRequest(RecordSchema, {
			operation: 'exists',
			request: jsonRequest('https://example.test/exists', {
				where: { huge: { eq: '4' } },
			}),
		})
		const first = await normalizeRestReadRequest(RecordSchema, {
			operation: 'first',
			request: new Request('https://example.test/first?select=name'),
		})
		const get = await normalizeRestReadRequest(RecordSchema, {
			id: recordId,
			operation: 'get',
			request: new Request('https://example.test/item?include=author'),
		})

		expect(count.kind).toBe('count')
		expect(exists.kind).toBe('exists')
		expect(first.kind).toBe('find-one')
		expect(get).toMatchObject({ id: recordId, kind: 'get' })
		expect(get.query.inclusion.fields[0]).toMatchObject({ field: 'author' })
	})

	it('applies the default limit and rejects excessive or malformed inputs safely', async () => {
		const normalized = await normalizeRestReadRequest(RecordSchema, {
			operation: 'find',
			request: new Request('https://example.test/records'),
		})
		expect(normalized.query.limit).toBe(100)

		const malformed: readonly unknown[] = [
			{ where: { missing: { eq: 1 } } },
			{ where: { huge: { eq: 1 } } },
			{ where: { blob: { eq: { ...binaryWire, data: '*' } } } },
			{
				where: {
					author: { eq: { ...pointerWire, className: 'WrongTarget' } },
				},
			},
			{ where: { name: { invented: 'x' } } },
			{ limit: 1001 },
			{ offset: -1 },
		]
		for (const value of malformed) {
			await expect(
				normalizeRestReadRequest(RecordSchema, {
					operation: 'find',
					request: jsonRequest('https://example.test/query', value),
				}),
			).rejects.toMatchObject({ code: restReadErrorCodes.invalidInput })
		}

		for (const query of [
			'limit=1&limit=2',
			'orderBy=id,-id',
			'unknown=value',
		]) {
			await expect(
				normalizeRestReadRequest(RecordSchema, {
					operation: 'find',
					request: new Request(`https://example.test/records?${query}`),
				}),
			).rejects.toMatchObject({ code: restReadErrorCodes.invalidInput })
		}
	})

	it('rejects a deterministic fuzz corpus before Core execution', async () => {
		let state = 0x2307
		const next = (): number => {
			state = (state * 1_664_525 + 1_013_904_223) >>> 0
			return state
		}
		const invalidOperands: readonly unknown[] = [
			true,
			42,
			[],
			{},
			'not-a-canonical-value',
		]
		for (let index = 0; index < 48; index += 1) {
			const operand = invalidOperands[next() % invalidOperands.length]
			const variants = [
				{ huge: { eq: operand } },
				{ blob: { eq: operand } },
				{ author: { eq: operand } },
				{ uid: { eq: operand } },
			] as const
			await expect(
				normalizeRestReadRequest(RecordSchema, {
					operation: 'find',
					request: jsonRequest('https://example.test/query', {
						where: variants[next() % variants.length],
					}),
				}),
			).rejects.toMatchObject({ code: restReadErrorCodes.invalidInput })
		}
	})

	it('enforces JSON media type and streamed byte limits before parsing', async () => {
		await expect(
			normalizeRestReadRequest(RecordSchema, {
				operation: 'find',
				request: new Request('https://example.test/query', {
					body: '{}',
					headers: { 'Content-Type': 'text/plain' },
					method: 'POST',
				}),
			}),
		).rejects.toMatchObject({
			code: restReadErrorCodes.unsupportedMediaType,
		})

		await expect(
			normalizeRestReadRequest(
				RecordSchema,
				{
					operation: 'find',
					request: jsonRequest('https://example.test/query', {
						value: 'large',
					}),
				},
				{ bodyBytes: 4, maximumResults: 1000 },
			),
		).rejects.toMatchObject({ code: restReadErrorCodes.bodyTooLarge })

		await expect(
			normalizeRestReadRequest(RecordSchema, {
				operation: 'find',
				request: jsonRequest(
					'https://example.test/query',
					{},
					{
						'Content-Length': '1',
					},
				),
			}),
		).rejects.toMatchObject({ code: restReadErrorCodes.invalidInput })
	})

	it('keeps pointer decoding nominal without loading its target', async () => {
		const operation = await normalizeRestReadRequest(RecordSchema, {
			operation: 'find',
			request: jsonRequest('https://example.test/query', {
				where: { author: { eq: pointerWire } },
			}),
		})
		const expression = operation.query.where?.expression
		if (expression?.kind !== 'equal') throw new Error('expected equality')
		expect(Pointer.is(expression.value)).toBe(true)
		expect(expression.value).toMatchObject({ id: authorId })
	})
})
