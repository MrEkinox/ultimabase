import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { startExposure } from './exposure.test-support.js'

const httpMethods = new Set(['delete', 'get', 'patch', 'post', 'put'])

/** Collects every `$ref` of one JSON value. */
const collectReferences = (value: unknown, found: string[] = []): string[] => {
	if (Array.isArray(value)) {
		for (const item of value) collectReferences(item, found)
	} else if (isPlainRecord(value)) {
		for (const [key, item] of Object.entries(value)) {
			if (key === '$ref' && typeof item === 'string') found.push(item)
			else collectReferences(item, found)
		}
	}
	return found
}

const resolve = (document: unknown, reference: string): unknown =>
	reference
		.slice(2)
		.split('/')
		.reduce<unknown>(
			(node, segment) => (isPlainRecord(node) ? node[segment] : undefined),
			document,
		)

const readDocument = async () => {
	const { send } = await startExposure({ openapi: true })
	const { body, response } = await send('/api/openapi.json')
	expect(response.status).toBe(200)
	expect(response.headers.get('content-type')).toBe(
		'application/json; charset=utf-8',
	)
	if (!isPlainRecord(body)) throw new TypeError('OpenAPI document missing')
	return body
}

// ADR-0324 decision 7.
describe('REST OpenAPI document', () => {
	it('is a structurally valid OpenAPI 3.1 document', async () => {
		const document = await readDocument()
		expect(document).toMatchObject({
			info: { title: 'UltimaBase REST API', version: '1' },
			openapi: '3.1.0',
			servers: [{ url: '/api' }],
		})
		const paths = document.paths
		if (!isPlainRecord(paths)) throw new TypeError('paths missing')
		const operationIds: string[] = []
		for (const [path, item] of Object.entries(paths)) {
			expect(path.startsWith('/')).toBe(true)
			if (!isPlainRecord(item)) throw new TypeError(`${path} is not an item`)
			for (const [method, operation] of Object.entries(item)) {
				expect(httpMethods.has(method)).toBe(true)
				if (!isPlainRecord(operation)) throw new TypeError('bad operation')
				expect(operation.responses).toBeDefined()
				if (typeof operation.operationId === 'string') {
					operationIds.push(operation.operationId)
				}
				// Every templated path declares its path parameter.
				if (path.includes('{id}')) {
					expect(operation.parameters).toEqual(
						expect.arrayContaining([
							expect.objectContaining({
								in: 'path',
								name: 'id',
								required: true,
							}),
						]),
					)
				}
			}
		}
		expect(new Set(operationIds).size).toBe(operationIds.length)
		for (const reference of collectReferences(document)) {
			expect([reference, resolve(document, reference)]).not.toEqual([
				reference,
				undefined,
			])
		}
	})

	it('describes exposed routes, fields, types and validator constraints', async () => {
		const document = await readDocument()
		const paths = Object.keys(
			isPlainRecord(document.paths) ? document.paths : {},
		)
		expect(paths).toEqual(
			expect.arrayContaining([
				'/classes/RestExposureNote',
				'/classes/RestExposureNote/count',
				'/classes/RestExposureNote/{id}/archive-one',
				'/operations/echo',
				'/operations/createInvoice',
			]),
		)
		expect(paths.some((path) => path.includes('RestExposureHidden'))).toBe(
			false,
		)
		expect(paths).not.toContain('/operations/secret')

		expect(
			resolve(document, '#/components/schemas/RestExposureNoteCreateInput'),
		).toMatchObject({
			type: 'object',
			properties: {
				title: { allOf: [{ type: 'string' }, { maxLength: 20 }] },
				views: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
			},
			required: ['title'],
			additionalProperties: false,
		})
		// A plugin-written field (forbidden mutation input) is output only.
		for (const input of ['CreateInput', 'UpdateInput']) {
			const schema = resolve(
				document,
				`#/components/schemas/RestExposureNote${input}`,
			)
			const properties =
				isPlainRecord(schema) && isPlainRecord(schema.properties)
					? Object.keys(schema.properties)
					: []
			expect(properties).toContain('title')
			expect(properties).not.toContain('archivedAt')
		}
		expect(
			resolve(document, '#/components/schemas/RestExposureNote'),
		).toMatchObject({
			properties: {
				archivedAt: {
					anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
				},
				id: { type: 'string', format: 'uuid' },
			},
		})
	})

	// Regression: relations were missing from both inputs while
	// `additionalProperties: false` declared the accepted links invalid.
	it('describes the relationship and numeric inputs the REST decoder accepts', async () => {
		const document = await readDocument()
		const component = (name: string): Readonly<Record<string, unknown>> => {
			const schema = resolve(document, `#/components/schemas/${name}`)
			if (!isPlainRecord(schema) || !isPlainRecord(schema.properties)) {
				throw new TypeError(`${name} has no properties`)
			}
			return schema.properties
		}
		const id = { type: 'string', format: 'uuid' }
		const ids = { type: 'array', items: id }
		const command = (name: string, schema: unknown) => ({
			type: 'object',
			properties: { [name]: schema },
			required: [name],
			additionalProperties: false,
		})
		const noteRef = (input: string) => ({
			$ref: `#/components/schemas/RestExposureNote${input}`,
		})
		const draftRef = (input: string) => ({
			$ref: `#/components/schemas/RestExposureDraft${input}`,
		})
		const pointerCreate = {
			oneOf: [
				command('connect', id),
				command('create', noteRef('CreateInput')),
			],
		}
		const pointerUpdate = {
			oneOf: [
				command('connect', id),
				command('create', noteRef('CreateInput')),
				command('update', noteRef('UpdateInput')),
			],
		}
		const create = component('RestExposureShelfCreateInput')
		expect(create.note).toStrictEqual({
			anyOf: [pointerCreate, { type: 'null' }],
		})
		expect(create.pinned).toStrictEqual(pointerCreate)
		expect(create.drafts).toStrictEqual({
			type: 'object',
			properties: {
				create: { type: 'array', items: draftRef('CreateInput') },
				connect: ids,
			},
			minProperties: 1,
			additionalProperties: false,
		})
		const update = component('RestExposureShelfUpdateInput')
		expect(update.note).toStrictEqual({
			anyOf: [pointerUpdate, { type: 'null' }],
		})
		expect(update.pinned).toStrictEqual(pointerUpdate)
		expect(update.drafts).toMatchObject({
			type: 'object',
			properties: {
				create: { type: 'array', items: draftRef('CreateInput') },
				connect: ids,
				update: {
					type: 'array',
					items: {
						type: 'object',
						properties: { id, data: draftRef('UpdateInput') },
						required: ['id', 'data'],
						additionalProperties: false,
					},
				},
				disconnect: ids,
				set: ids,
			},
			minProperties: 1,
			additionalProperties: false,
		})
		// An atomic operation names exactly one operator and a non-null operand.
		expect(update.count).toStrictEqual({
			anyOf: [
				{ anyOf: [{ type: 'integer' }, { type: 'null' }] },
				{
					type: 'object',
					properties: {
						increment: { type: 'integer' },
						decrement: { type: 'integer' },
					},
					minProperties: 1,
					maxProperties: 1,
					additionalProperties: false,
				},
			],
		})

		// Upsert and bulk bodies cannot link relationships (ADR-0243).
		const unlinked = (input: string) => ({
			allOf: [
				{ $ref: `#/components/schemas/RestExposureShelf${input}` },
				{ properties: { note: false, pinned: false, drafts: false } },
			],
		})
		const paths = isPlainRecord(document.paths) ? document.paths : {}
		expect(paths['/classes/RestExposureShelf/bulk/create']).toMatchObject({
			post: {
				requestBody: {
					content: {
						'application/json': {
							schema: {
								properties: {
									data: { type: 'array', items: unlinked('CreateInput') },
								},
							},
						},
					},
				},
			},
		})
		expect(paths['/classes/RestExposureShelf/upsert']).toMatchObject({
			post: {
				requestBody: {
					content: {
						'application/json': {
							schema: {
								properties: {
									create: unlinked('CreateInput'),
									update: unlinked('UpdateInput'),
								},
							},
						},
					},
				},
			},
		})
	})

	it('documents application operations from their validators', async () => {
		const document = await readDocument()
		const paths = isPlainRecord(document.paths) ? document.paths : {}
		expect(paths['/operations/createInvoice']).toMatchObject({
			post: {
				operationId: 'createInvoice',
				requestBody: {
					content: {
						'application/json': {
							schema: {
								properties: {
									input: {
										type: 'object',
										properties: {
											customer: { type: 'string', minLength: 2 },
											amount: { type: 'integer', exclusiveMinimum: 0 },
										},
										required: ['customer', 'amount'],
									},
								},
								required: ['input'],
							},
						},
					},
				},
				responses: {
					'200': {
						content: {
							'application/json': {
								schema: {
									properties: {
										result: {
											type: 'object',
											properties: { invoice: { type: 'string' } },
										},
									},
								},
							},
						},
					},
				},
			},
		})
	})

	it('never reveals an access rule', async () => {
		const document = await readDocument()
		const serialized = JSON.stringify(document)
		expect(serialized).not.toMatch(/access|allowWithoutRule|policy/iu)
	})

	it('is not served by default', async () => {
		const { send } = await startExposure()
		const { response } = await send('/api/openapi.json')
		expect(response.status).toBe(404)
	})
})
