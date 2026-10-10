import { UltimaBase, SchemaRegistry, definePluginField } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	normalizeRestMutationRequest,
	restFieldCodec,
	restMutationErrorCodes,
} from './index.js'

const authorId = '01991f00-0000-7000-8000-000000000001'
const recordId = '01991f00-0000-7000-8000-000000000002'

const portableCode = definePluginField(
	'fixture.mutation-code',
	{},
	{
		snapshotValue: (value, path): string => {
			if (typeof value !== 'string' || value !== value.toUpperCase()) {
				throw new TypeError(`${path} must be uppercase`)
			}
			return value
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
						throw new TypeError('Expected a code object')
					}
					return value.code.toUpperCase()
				},
				encode: (value) => ({ code: value.toLowerCase() }),
			}),
		],
	},
)

const Author = UltimaBase.Schema.define({
	className: 'RestMutationAuthor',
	fields: (field) => ({
		code: portableCode,
		huge: field.bigint(),
		name: field.string(),
		label: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => String(item.name),
			select: { name: true },
		}),
		profile: field.object({
			fields: (nested) => ({ scores: nested.bigint({ list: true }) }),
		}),
	}),
})

const RecordSchema = UltimaBase.Schema.define({
	className: 'RestMutationRecord',
	fields: (field) => ({
		author: field.pointer({ target: 'RestMutationAuthor' }),
		blob: field.binary(),
		huge: field.bigint(),
		payload: field.object({
			fields: (nested) => ({
				matrix: nested.bigint({ list: true }),
			}),
		}),
		portableCode,
		related: field.relation({ target: 'RestMutationAuthor' }),
		slug: field.string({ indexed: 'unique' }),
		title: field.string(),
		views: field.int(),
		displayTitle: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => String(item.title),
			select: { title: true },
		}),
	}),
})

new SchemaRegistry([Author, RecordSchema]).resolveSchemaTargets()

const jsonRequest = (
	method: string,
	body: unknown,
	query = '',
	headers: Readonly<Record<string, string>> = {},
): Request =>
	new Request(`https://example.test/records${query}`, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json', ...headers },
		method,
	})

const pointerWire = {
	className: 'RestMutationAuthor',
	id: authorId,
	type: 'pointer',
}

describe('REST mutation normalization', () => {
	it('selects virtual results and rejects direct and nested virtual inputs', async () => {
		const selected = await normalizeRestMutationRequest(RecordSchema, {
			operation: 'create',
			request: jsonRequest(
				'POST',
				{ title: 'Created' },
				'?select=id,displayTitle',
			),
		})

		expect(selected.input.select).toStrictEqual({
			displayTitle: true,
			id: true,
		})
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: jsonRequest('POST', { displayTitle: 'forged' }),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: jsonRequest('POST', {
					author: { create: { label: 'forged', name: 'Ada' } },
				}),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })
	})

	it('decodes concise create and update bodies through schema field contracts', async () => {
		const create = await normalizeRestMutationRequest(RecordSchema, {
			operation: 'create',
			request: jsonRequest(
				'POST',
				{
					author: { connect: authorId },
					blob: { data: 'AQID', encoding: 'base64', type: 'binary' },
					huge: '9007199254740993',
					payload: { matrix: ['1', '2', '3'] },
					portableCode: { code: 'abc' },
					title: 'Created',
				},
				'?select=title,author&include=author',
			),
		})

		expect(create.kind).toBe('create-one')
		expect(create.input.select).toStrictEqual({ author: true, title: true })
		expect(create.input.include).toStrictEqual({ author: {} })
		expect(create.input.data).toMatchObject({
			blob: new Uint8Array([1, 2, 3]),
			huge: 9_007_199_254_740_993n,
			payload: { matrix: [1n, 2n, 3n] },
			portableCode: 'ABC',
			title: 'Created',
		})
		expect(create.input.data.author).toStrictEqual({ connect: authorId })

		const update = await normalizeRestMutationRequest(RecordSchema, {
			id: recordId,
			operation: 'update',
			request: jsonRequest(
				'PATCH',
				{
					huge: { decrement: '2' },
					views: { increment: 3 },
				},
				'?select=views,huge',
			),
		})

		expect(update).toMatchObject({
			kind: 'update-one',
			input: {
				data: {
					huge: { decrement: 2n },
					views: { increment: 3 },
				},
				where: { id: { eq: recordId } },
				select: { huge: true, views: true },
			},
		})
	})

	it('decodes the complete singular nested-write command matrix', async () => {
		const nestedCreate = {
			code: { code: 'abc' },
			huge: '9007199254740993',
			name: 'Ada',
			profile: { scores: ['1', '2'] },
		}
		const create = await normalizeRestMutationRequest(RecordSchema, {
			operation: 'create',
			request: jsonRequest('POST', {
				author: { create: nestedCreate },
				related: {
					connect: [authorId],
					create: [nestedCreate],
				},
			}),
		})

		expect(create.input.data).toStrictEqual({
			author: {
				create: {
					code: 'ABC',
					huge: 9_007_199_254_740_993n,
					name: 'Ada',
					profile: { scores: [1n, 2n] },
				},
			},
			related: {
				connect: [authorId],
				create: [
					{
						code: 'ABC',
						huge: 9_007_199_254_740_993n,
						name: 'Ada',
						profile: { scores: [1n, 2n] },
					},
				],
			},
		})

		const update = await normalizeRestMutationRequest(RecordSchema, {
			id: recordId,
			operation: 'update',
			request: jsonRequest('PATCH', {
				author: {
					update: {
						huge: { decrement: '2' },
						name: 'Updated',
					},
				},
				related: {
					connect: [authorId],
					create: [{ name: 'Created' }],
					disconnect: [recordId],
					update: [
						{
							data: {
								code: { code: 'def' },
								huge: { increment: '3' },
							},
							id: recordId,
						},
					],
				},
			}),
		})

		expect(update.input.data).toMatchObject({
			author: {
				update: { huge: { decrement: 2n }, name: 'Updated' },
			},
			related: {
				connect: [authorId],
				create: [{ name: 'Created' }],
				disconnect: [recordId],
				update: [
					{
						data: {
							code: 'DEF',
							huge: { increment: 3n },
						},
						id: recordId,
					},
				],
			},
		})

		// ADR-0308: `null` unlinks a pointer and `{ set: [] }` empties a relation.
		for (const [field, command] of [
			['author', { connect: authorId }],
			['author', { create: { name: 'Created' } }],
			['author', null],
			['related', { set: [] }],
		] as const) {
			const normalized = await normalizeRestMutationRequest(RecordSchema, {
				id: recordId,
				operation: 'update',
				request: jsonRequest('PATCH', { [field]: command }),
			})
			expect(normalized.input.data[field]).toStrictEqual(command)
		}
		for (const [field, command] of [
			['author', { disconnect: true }],
			['related', { clear: true }],
		] as const) {
			await expect(
				normalizeRestMutationRequest(RecordSchema, {
					id: recordId,
					operation: 'update',
					request: jsonRequest('PATCH', { [field]: command }),
				}),
			).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })
		}
	})

	it('maps delete, upsert, and every homogeneous bulk body to Core commands', async () => {
		const deletion = await normalizeRestMutationRequest(RecordSchema, {
			id: recordId,
			operation: 'delete',
			request: new Request(
				'https://example.test/records/item?select=id,title',
				{ method: 'DELETE' },
			),
		})
		expect(deletion).toStrictEqual({
			kind: 'delete-one',
			input: {
				select: { id: true, title: true },
				where: { id: { eq: recordId } },
			},
		})
		const streamedDeleteRequest = new Request(
			'https://example.test/records/item',
			{ method: 'DELETE' },
		)
		Object.defineProperty(streamedDeleteRequest, 'body', {
			value: new ReadableStream<Uint8Array>({
				start: (controller) => {
					controller.close()
				},
			}),
		})
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				id: recordId,
				operation: 'delete',
				request: streamedDeleteRequest,
			}),
		).resolves.toMatchObject({ kind: 'delete-one' })
		const streamedDeleteWithContent = new Request(
			'https://example.test/records/item',
			{ method: 'DELETE' },
		)
		Object.defineProperty(streamedDeleteWithContent, 'body', {
			value: new ReadableStream<Uint8Array>({
				start: (controller) => {
					controller.enqueue(new Uint8Array([1]))
					controller.close()
				},
			}),
		})
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				id: recordId,
				operation: 'delete',
				request: streamedDeleteWithContent,
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })

		const upsert = await normalizeRestMutationRequest(RecordSchema, {
			operation: 'upsert',
			request: jsonRequest('POST', {
				create: { slug: 'one', title: 'Created' },
				select: { slug: true },
				update: { views: { increment: 1 } },
				where: { slug: { eq: 'one' } },
			}),
		})
		expect(upsert).toMatchObject({
			kind: 'upsert-one',
			input: {
				create: { slug: 'one', title: 'Created' },
				select: { slug: true },
				update: { views: { increment: 1 } },
				where: { slug: { eq: 'one' } },
			},
		})

		const commands = await Promise.all([
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'bulk-create',
				request: jsonRequest('POST', {
					data: [
						{ huge: '1', slug: 'a' },
						{ huge: '2', slug: 'b' },
					],
					select: { huge: true },
				}),
			}),
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'bulk-update',
				request: jsonRequest('POST', {
					data: [
						{
							data: { views: { increment: 1 } },
							where: { id: { eq: recordId } },
						},
					],
				}),
			}),
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'bulk-delete',
				request: jsonRequest('POST', {
					where: [{ id: { eq: recordId } }],
				}),
			}),
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'bulk-upsert',
				request: jsonRequest('POST', {
					data: [
						{
							create: { slug: 'a' },
							update: { huge: { decrement: '1' } },
							where: { slug: { eq: 'a' } },
						},
					],
				}),
			}),
		])

		expect(commands.map(({ kind }) => kind)).toStrictEqual([
			'create-many',
			'update-many',
			'delete-many',
			'upsert-many',
		])
		expect(commands[0].input).toMatchObject({
			data: [{ huge: 1n }, { huge: 2n }],
		})
		expect(commands[1].input).toMatchObject({
			data: [{ data: { views: { increment: 1 } } }],
		})
		expect(commands[3].input).toMatchObject({
			data: [{ update: { huge: { decrement: 1n } } }],
		})
	})

	it('enforces methods, bodylessness, media type, streamed size, and cancellation', async () => {
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: new Request('https://example.test/records', {
					body: '{}',
					method: 'POST',
				}),
			}),
		).rejects.toMatchObject({
			code: restMutationErrorCodes.unsupportedMediaType,
		})

		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: jsonRequest('PATCH', {}),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })

		await expect(
			normalizeRestMutationRequest(
				RecordSchema,
				{
					operation: 'create',
					request: jsonRequest('POST', { title: 'Too large' }),
				},
				{ bodyBytes: 4, maximumResults: 10 },
			),
		).rejects.toMatchObject({ code: restMutationErrorCodes.bodyTooLarge })

		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: jsonRequest('POST', {}, '', { 'Content-Length': '1' }),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })

		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: jsonRequest('POST', {}, '', {
					'Content-Length': '2',
					'Transfer-Encoding': 'chunked',
				}),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })

		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				id: recordId,
				operation: 'delete',
				request: jsonRequest('DELETE', {}),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })

		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'bulk-create',
				request: jsonRequest('POST', { data: [] }, '?select=id'),
			}),
		).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })

		const controller = new AbortController()
		controller.abort('client disconnected')
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: jsonRequest('POST', {}, '', { Accept: 'application/json' }),
			}),
		).resolves.toMatchObject({ kind: 'create-one' })
		const cancelledRequest = new Request('https://example.test/records', {
			body: '{}',
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal: controller.signal,
		})
		await expect(
			normalizeRestMutationRequest(RecordSchema, {
				operation: 'create',
				request: cancelledRequest,
			}),
		).rejects.toBe('client disconnected')
	})

	it('rejects legacy pointer tags and malformed nested wire values', async () => {
		for (const body of [
			{ related: [] },
			{ author: pointerWire },
			{ author: { connect: pointerWire } },
			{ author: { connect: 'not-a-uuid-v7' } },
			{ author: { create: { huge: '01' } } },
			{ related: { connect: [authorId, 'not-a-uuid-v7'] } },
			{ related: { update: [{ data: { huge: '01' }, id: authorId }] } },
			{ portableCode: { wrong: true } },
		]) {
			await expect(
				normalizeRestMutationRequest(RecordSchema, {
					operation: 'create',
					request: jsonRequest('POST', body),
				}),
			).rejects.toMatchObject({
				code: restMutationErrorCodes.invalidInput,
			})
		}

		for (const [operation, body] of [
			[
				'upsert',
				{
					create: { author: pointerWire },
					update: { title: 'Updated' },
					where: { slug: { eq: 'one' } },
				},
			],
			['bulk-create', { data: [{ author: pointerWire }] }],
		] as const) {
			await expect(
				normalizeRestMutationRequest(RecordSchema, {
					operation,
					request: jsonRequest('POST', body),
				}),
			).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })
		}
	})
})
