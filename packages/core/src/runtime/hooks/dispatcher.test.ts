import { createApplication, definePlugin } from '../../foundation.js'
import {
	normalizeUpdateExpression,
	QueryBuilder,
	type CountOperationAst,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DeleteManyOperationAst,
	type ExistsOperationAst,
	type FindManyOperationAst,
	type FindOneOperationAst,
	type GetOperationAst,
	type QueryFilterNode,
	type UpdateOneOperationAst,
	type UpdateManyOperationAst,
} from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import { isSchemaModelInstance } from '../../schema/schema/model.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import { createRuntimeValidationStage } from '../validation/runtime-validation.js'
import { createNativeHookStages } from './dispatcher.js'

const fixedInstant = new Date('2026-08-02T12:00:00.000Z')
const generatedId = '00000000-0000-7000-8000-000000000001'
const context = RequestContext.anonymous({
	requestId: 'native-dispatcher',
	source: requestSources.internal,
})

describe('native hook dispatcher', () => {
	it('executes one immutable nested lifecycle in its fixed wrapping order', async () => {
		const trace: string[] = []
		const ignoredReplacement: { current?: unknown } = {}
		let observedCreateItem: unknown
		const record = (label: string): void => {
			trace.push(label)
		}
		const observeBeforeCreate = (input: unknown): void => {
			if (!isPlainRecord(input)) {
				throw new TypeError('Create observer input must be a plain object')
			}

			expect(Object.keys(input).sort()).toStrictEqual([
				'context',
				'item',
				'kind',
			])
			expect(input.kind).toBe('create')

			if (typeof input.item !== 'object' || input.item === null) {
				throw new TypeError('Create observer item must be an object')
			}

			expect(typeof Reflect.get(input.item, 'get')).toBe('function')
			observedCreateItem = input.item
			record('schema:beforeCreate')

			// Runtime ignores values returned by untyped JavaScript observers.
			// @ts-expect-error -- The boundary test deliberately simulates untyped JavaScript.
			return ignoredReplacement.current
		}
		const schema = Schema.define({
			className: 'NativeHookArticle',
			fields: (field) => ({
				profile: field.object({
					fields: (field) => ({
						name: field.string({
							hooks: {
								resolveInput: ({ value }) => {
									record(`name:resolve:${String(value)}`)
									return value === null ? null : value.trim()
								},
							},
						}),
					}),
					hooks: {
						resolveInput: ({ value }) => {
							record(`profile:resolve:${String(value?.name)}`)
							return value
						},
					},
				}),
			}),
			hooks: {
				afterOperation: {
					create: () => {
						record('schema:afterCreate')
					},
				},
				beforeOperation: {
					create: [
						observeBeforeCreate,
						({ item }) => {
							expect(item).toBe(observedCreateItem)
						},
					],
				},
				resolveInput: ({ kind, operation, originalItem }) => {
					expect(kind).toBe('create')
					expect(originalItem).toBeNull()
					if (operation.kind === 'create-one') {
						const profile: unknown = operation.input.profile
						record(
							`schema:resolve:${String(isPlainRecord(profile) ? profile.name : undefined)}`,
						)
					}

					return operation
				},
			},
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const validate = createRuntimeValidationStage({
			clock: () => fixedInstant,
			uuidV7Generator: () => generatedId,
		})
		const rawOperation = immutableRecord({
			input: { profile: { name: '  Ada  ' } },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		let operation = await validate({ context, operation: rawOperation })

		operation = await stages.resolveInput({ context, operation })
		operation = await stages.revalidate({ context, operation })
		operation = await stages.schemaResolveInput({
			context,
			operation,
			target: undefined,
		})
		ignoredReplacement.current = immutableRecord({
			...operation,
			input: { ...operation.input, profile: { name: 'Ignored' } },
		})
		await stages.schemaPrepared({
			context,
			operation,
			target: undefined,
		})

		const persisted = immutableRecord({
			createdAt: fixedInstant.toISOString(),
			id: generatedId,
			profile: operation.input.profile,
			updatedAt: fixedInstant.toISOString(),
		})
		const sourceOutcome = immutableRecord({
			materializations: immutableArray([
				immutableRecord({ current: persisted, kind: 'create' as const }),
			]),
			result: persisted,
		}) satisfies DatabaseOperationOutcome<typeof operation>
		const outcome = await stages.mutationOutcome({
			context,
			operation,
			outcome: sourceOutcome,
		})
		const result = await stages.schemaAfter({
			context,
			operation,
			outcome,
			result: outcome.result,
		})

		const resultProfile: unknown = result.profile
		expect(isPlainRecord(resultProfile) ? resultProfile.name : undefined).toBe(
			'Ada',
		)
		expect(Object.isFrozen(result)).toBe(true)
		expect(trace).toStrictEqual([
			'name:resolve:  Ada  ',
			'profile:resolve:Ada',
			'schema:resolve:Ada',
			'schema:beforeCreate',
			'schema:afterCreate',
		])

		await application.dispose()
	})

	it('materializes persisted original items for every schema hook boundary', async () => {
		let resolvedOriginal: object | undefined
		let preparedOriginal: object | undefined
		let persistedOriginal: object | undefined
		let persistedItem: object | undefined
		const schema = Schema.define({
			className: 'MaterializedOriginalArticle',
			fields: (field) => ({ title: field.string() }),
			hooks: {
				resolveInput: {
					update: [
						({ kind, operation, originalItem }) => {
							expect(kind).toBe('update')
							expect(originalItem.get('title')).toBe('Before')
							resolvedOriginal = originalItem

							return operation
						},
						({ kind, operation, originalItem }) => {
							expect(kind).toBe('update')
							expect(originalItem).toBe(resolvedOriginal)

							return operation
						},
					],
				},
				beforeOperation: {
					update: [
						({ kind, originalItem }) => {
							expect(kind).toBe('update')
							expect(originalItem.get('title')).toBe('Before')
							preparedOriginal = originalItem
						},
						({ kind, originalItem }) => {
							expect(kind).toBe('update')
							expect(originalItem).toBe(preparedOriginal)
						},
					],
				},
				afterOperation: {
					update: [
						({ item, kind, originalItem }) => {
							expect(kind).toBe('update')
							expect(originalItem.get('title')).toBe('Before')
							expect(item.get('title')).toBe('After')
							persistedOriginal = originalItem
							persistedItem = item
						},
						({ item, kind, originalItem }) => {
							expect(kind).toBe('update')
							expect(originalItem).toBe(persistedOriginal)
							expect(item).toBe(persistedItem)
						},
					],
				},
			},
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const query = new QueryBuilder(schema).ast
		const operation = immutableRecord({
			kind: 'update-one',
			query,
			update: normalizeUpdateExpression(schema, { title: 'After' }),
		}) satisfies UpdateOneOperationAst<typeof schema>
		const original = immutableRecord({
			createdAt: fixedInstant.toISOString(),
			id: generatedId,
			title: 'Before',
			updatedAt: fixedInstant.toISOString(),
		})
		const current = immutableRecord({ ...original, title: 'After' })
		const resolved = await stages.schemaResolveInput({
			context,
			operation,
			target: original,
		})
		await stages.schemaPrepared({
			context,
			operation: resolved,
			target: original,
		})
		const outcome = await stages.mutationOutcome({
			context,
			operation: resolved,
			outcome: immutableRecord({
				materializations: immutableArray([
					immutableRecord({
						current,
						kind: 'update' as const,
						previous: original,
					}),
				]),
				result: current,
			}),
		})

		await stages.schemaAfter({
			context,
			operation: resolved,
			outcome,
			result: outcome.result,
		})

		if (
			resolvedOriginal === undefined ||
			preparedOriginal === undefined ||
			persistedOriginal === undefined ||
			persistedItem === undefined
		) {
			throw new TypeError('Every original item hook boundary must execute')
		}

		expect(isSchemaModelInstance(schema, resolvedOriginal)).toBe(true)
		expect(isSchemaModelInstance(schema, preparedOriginal)).toBe(true)
		expect(isSchemaModelInstance(schema, persistedOriginal)).toBe(true)
		expect(isSchemaModelInstance(schema, persistedItem)).toBe(true)

		await application.dispose()
	})

	it('does not expose low-level set operations to public item hooks', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'NativeBulkHooks',
			fields: (field) => ({
				title: field.string({
					hooks: {
						resolveInput: ({ value }) => {
							trace.push(`field:resolve:${String(value)}`)
							return value === null ? null : value.trim()
						},
					},
				}),
			}),
			hooks: {
				afterOperation: {
					create: () => {
						trace.push('schema:after')
					},
				},
				beforeOperation: {
					create: ({ item }) => {
						trace.push('schema:before')
						void item
					},
				},
			},
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const generatedIds = [generatedId, '00000000-0000-7000-8000-000000000002']
		const validate = createRuntimeValidationStage({
			clock: () => fixedInstant,
			uuidV7Generator: () => {
				const id = generatedIds.shift()

				if (id === undefined) {
					throw new TypeError('Missing generated bulk identifier')
				}

				return id
			},
		})
		const operation = immutableRecord({
			inputs: immutableArray([{ title: ' First ' }, { title: ' Second ' }]),
			kind: 'create-many',
			selection: new QueryBuilder(schema).ast.selection,
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateManyOperationAst<typeof schema>
		const validated = await validate({ context, operation })
		const resolved = await stages.resolveInput({
			context,
			operation: validated,
		})
		await stages.schemaPrepared({
			context,
			operation: resolved,
			target: undefined,
		})

		const records = immutableArray([
			immutableRecord({
				createdAt: fixedInstant.toISOString(),
				id: generatedId,
				title: 'First',
				updatedAt: fixedInstant.toISOString(),
			}),
			immutableRecord({
				createdAt: fixedInstant.toISOString(),
				id: '00000000-0000-7000-8000-000000000002',
				title: 'Second',
				updatedAt: fixedInstant.toISOString(),
			}),
		])
		const outcome = await stages.mutationOutcome({
			context,
			operation: resolved,
			outcome: immutableRecord({
				materializations: immutableArray(
					records.map((current) =>
						immutableRecord({ current, kind: 'create' as const }),
					),
				),
				result: records,
			}),
		})

		await stages.schemaAfter({
			context,
			operation: resolved,
			outcome,
			result: outcome.result,
		})

		expect(trace).toStrictEqual([])

		await application.dispose()
	})

	it('does not request set targets for public item hooks', async () => {
		const schema = Schema.define({
			className: 'PreparedSetHookTargets',
			fields: (field) => ({ title: field.string() }),
			hooks: {
				afterOperation: { update: () => undefined },
			},
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const query = new QueryBuilder(schema).ast
		const update = immutableRecord({
			kind: 'update-many',
			query,
			update: normalizeUpdateExpression(schema, { title: 'Updated' }),
		}) satisfies UpdateManyOperationAst<typeof schema>
		const deletion = immutableRecord({
			kind: 'delete-many',
			query,
		}) satisfies DeleteManyOperationAst<typeof schema>

		expect(stages.requiresPreparedMutationItems(update)).toBe(false)
		expect(stages.requiresPreparedMutationItems(deletion)).toBe(false)
		await expect(
			stages.schemaPrepared({
				context,
				operation: deletion,
				target: undefined,
			}),
		).resolves.toBeUndefined()

		await application.dispose()
	})

	it('wraps developer and plugin field resolution around parent hooks', async () => {
		const trace: string[] = []
		const title = stringField({
			hooks: {
				resolveInput: ({ value }) => {
					trace.push('field:developer:resolve')
					return value
				},
			},
		})
		const schema = Schema.define({
			className: 'NativeHookPluginOrder',
			fields: () => ({ title }),
			hooks: {
				afterOperation: {
					create: () => {
						trace.push('schema:developer:after')
					},
				},
				beforeOperation: {
					create: ({ item }) => {
						trace.push('schema:developer:before')
						void item
					},
				},
			},
		})
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.native-hook-order',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Registers native field hooks for dispatcher tests.',
				},
			],
			setup: ({ hooks }) => {
				hooks.schema('schema', schema, {
					afterOperation: {
						create: () => {
							trace.push('schema:plugin:after')
						},
					},
					beforeOperation: {
						create: ({ item }) => {
							trace.push('schema:plugin:before')
							void item
						},
					},
				})
				hooks.field('field', schema, ['title'], {
					resolveInput: ({ value }) => {
						trace.push('field:plugin:resolve')
						return value
					},
				})
			},
		})
		const application = await createApplication({
			plugins: [plugin],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const operation = immutableRecord({
			input: {
				createdAt: fixedInstant.toISOString(),
				id: generatedId,
				title: 'ordered',
				updatedAt: fixedInstant.toISOString(),
			},
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const resolved = await stages.resolveInput({ context, operation })
		await stages.schemaPrepared({
			context,
			operation: resolved,
			target: undefined,
		})
		const outcome = await stages.mutationOutcome({
			context,
			operation: resolved,
			outcome: {
				materializations: [{ current: resolved.input, kind: 'create' }],
				result: resolved.input,
			},
		})
		await stages.schemaAfter({
			context,
			operation: resolved,
			outcome,
			result: outcome.result,
		})

		expect(trace).toStrictEqual([
			'field:plugin:resolve',
			'field:developer:resolve',
			'schema:plugin:before',
			'schema:developer:before',
			'schema:developer:after',
			'schema:plugin:after',
		])

		await application.dispose()
	})

	it('leaves every read terminal unchanged by native schema hooks', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'NativeHookRead',
			fields: (field) => ({
				hidden: field.string(),
				title: field.string(),
			}),
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const selectedQuery = new QueryBuilder(schema).select({ title: true })
		const findOperation: FindManyOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({ kind: 'find-many', query: selectedQuery.ast })
		const firstOperation: FindOneOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({ kind: 'find-one', query: selectedQuery.ast })
		const getOperation: GetOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({
			id: generatedId,
			kind: 'get',
			query: selectedQuery.ast,
		})
		const countOperation: CountOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({ kind: 'count', query: selectedQuery.ast })
		const existsOperation: ExistsOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({ kind: 'exists', query: selectedQuery.ast })
		const operations = [
			findOperation,
			firstOperation,
			getOperation,
			countOperation,
			existsOperation,
		] as const

		const executeRead = async <
			const TOperation extends (typeof operations)[number],
		>(
			operation: TOperation,
			sourceResult: DatabaseOperationResult<TOperation>,
			expectedResult: unknown,
		): Promise<void> => {
			const resolved = await stages.resolveOutput({
				context,
				operation,
				result: sourceResult,
			})
			const result = await stages.schemaAfter({
				context,
				operation,
				result: resolved as RuntimeOperationResult<TOperation>,
			})

			expect(result).toStrictEqual(expectedResult)
			expect(operation.query.where).toBeUndefined()
			expect(operation.query.selection).toStrictEqual(
				selectedQuery.ast.selection,
			)
		}

		await executeRead(
			operations[0],
			immutableArray([immutableRecord({ id: generatedId, title: 'visible' })]),
			[{ id: generatedId, title: 'visible' }],
		)
		await executeRead(
			operations[1],
			immutableRecord({ id: generatedId, title: 'visible' }),
			{ id: generatedId, title: 'visible' },
		)
		await executeRead(operations[2], null, null)
		await executeRead(operations[3], 2, 2)
		await executeRead(operations[4], true, true)

		expect(selectedQuery.ast.where).toBeUndefined()
		expect(trace).toStrictEqual([])

		await application.dispose()
	})

	it('rejects values that are not initialized framework applications', () => {
		expect(() => createNativeHookStages(null as never)).toThrow(
			'Native hook stages require a FrameworkApplication',
		)
	})
})
