import { createApplication, definePlugin } from '../../foundation.js'
import {
	QueryBuilder,
	type CountOperationAst,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type ExistsOperationAst,
	type FindManyOperationAst,
	type FindOneOperationAst,
	type GetOperationAst,
	type QueryFilterNode,
} from '../../query/index.js'
import {
	objectField,
	pointerField,
	Schema,
	stringField,
} from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
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
		const record = (label: string): void => {
			trace.push(label)
		}
		const observeBeforeCreate: () => void = () => {
			record('schema:beforeCreate')

			// Runtime ignores values returned by untyped JavaScript observers.
			return ignoredReplacement.current
		}
		const schema = Schema.define({
			className: 'NativeHookArticle',
			fields: {
				profile: objectField({
					fields: {
						name: stringField({
							hooks: {
								resolveInput: ({ value }) => {
									record(`name:resolve:${String(value)}`)

									return value === null ? null : value.trim()
								},
							},
						}),
					},
					hooks: {
						resolveInput: ({ value }) => {
							record(`profile:resolve:${String(value?.name)}`)

							return value
						},
					},
				}),
			},
			hooks: {
				afterOperation: {
					create: () => {
						record('schema:afterCreate')
					},
				},
				beforeOperation: { create: observeBeforeCreate },
				resolveInput: ({ operation }) => {
					if (operation.kind === 'create-one') {
						record(`schema:resolve:${String(operation.input.profile?.name)}`)
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
		await stages.validate({ context, operation })
		operation = await stages.schemaBefore({ context, operation })
		ignoredReplacement.current = immutableRecord({
			...operation,
			input: { ...operation.input, profile: { name: 'Ignored' } },
		})
		operation = await stages.schemaPrepared({
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

		expect(result.profile?.name).toBe('Ada')
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

	it('wraps one bulk operation while visiting item fields in stable order', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'NativeBulkHooks',
			fields: {
				title: stringField({
					hooks: {
						resolveInput: ({ value }) => {
							trace.push(`field:resolve:${String(value)}`)

							return value === null ? null : value.trim()
						},
					},
				}),
			},
			hooks: {
				afterOperation: { create: () => {
					trace.push('schema:after')
				} },
				beforeOperation: { create: ({ operation }) => {
					trace.push('schema:before')
					void operation
				} },
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
			options: immutableRecord({ atomic: true }),
			selection: new QueryBuilder(schema).ast.selection,
			schema: new QueryBuilder(schema).ast.schema,
		}) satisfies CreateManyOperationAst<typeof schema>
		const validated = await validate({ context, operation })
		const resolved = await stages.resolveInput({
			context,
			operation: validated,
		})
		const prepared = await stages.schemaPrepared({
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
			operation: prepared,
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
			operation: prepared,
			outcome,
			result: outcome.result,
		})

		expect(trace).toStrictEqual([
			'field:resolve: First ',
			'field:resolve: Second ',
			'schema:before',
			'schema:after',
		])

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
			fields: { title },
			hooks: {
				afterOperation: { create: () => {
					trace.push('schema:developer:after')
				} },
				beforeOperation: { create: ({ operation }) => {
					trace.push('schema:developer:before')
					void operation
				} },
			},
		})
		const plugin = definePlugin({
			name: 'fixture.native-hook-order',
			setup: ({ hooks }) => {
				hooks.schema('schema', schema, {
					afterOperation: { create: () => {
						trace.push('schema:plugin:after')
					} },
					beforeOperation: { create: ({ operation }) => {
						trace.push('schema:plugin:before')
						void operation
					} },
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
		const transformed = await stages.schemaPrepared({
			context,
			operation: resolved,
			target: undefined,
		})
		const outcome = await stages.mutationOutcome({
			context,
			operation: transformed,
			outcome: {
				materializations: [{ current: transformed.input, kind: 'create' }],
				result: transformed.input,
			},
		})
		await stages.schemaAfter({
			context,
			operation: transformed,
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
			fields: {
				hidden: stringField(),
				title: stringField(),
			},
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
			const transformed = await stages.schemaBefore({ context, operation })
			const resolved = await stages.resolveOutput({
				context,
				operation: transformed,
				result: sourceResult,
			})
			const result = await stages.schemaAfter({
				context,
				operation: transformed,
				result: resolved as RuntimeOperationResult<TOperation>,
			})

			expect(result).toStrictEqual(expectedResult)
			expect(transformed.query.where).toBeUndefined()
			expect(transformed.query.selection).toStrictEqual(
				selectedQuery.ast.selection,
			)
		}

		await executeRead(
			operations[0],
			immutableArray([immutableRecord({ title: 'visible' })]),
			[{ title: 'visible' }],
		)
		await executeRead(operations[1], immutableRecord({ title: 'visible' }), {
			title: 'visible',
		})
		await executeRead(operations[2], null, null)
		await executeRead(operations[3], 2, 2)
		await executeRead(operations[4], true, true)

		expect(selectedQuery.ast.where).toBeUndefined()
		expect(trace).toStrictEqual([])

		await application.dispose()
	})

	it('retains read pointer inclusions through the native no-op stage', async () => {
		const targetSchema = Schema.define({
			className: 'NativeHookReadInclusionTarget',
			fields: { name: stringField() },
		})
		const hookInputFields = {
			author: pointerField({ target: () => targetSchema }),
			title: stringField(),
		}
		const schema = Schema.define({
			className: 'NativeHookReadInclusion',
			fields: hookInputFields,
		})
		const application = await createApplication({
			plugins: [],
			schemas: [targetSchema, schema],
		})
		const stages = createNativeHookStages(application)
		const operation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(schema).include('author', (target) =>
				target.select({ name: true }),
			).ast,
		}) satisfies FindManyOperationAst<typeof schema>
		const transformed = await stages.schemaBefore({ context, operation })

		expect(transformed).toBe(operation)

		await application.dispose()
	})

	it('rejects values that are not initialized framework applications', () => {
		expect(() => createNativeHookStages(null as never)).toThrow(
			'Native hook stages require a FrameworkApplication',
		)
	})
})
