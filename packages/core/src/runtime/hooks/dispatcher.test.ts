import {
	createApplication,
	definePlugin,
	FrameworkError,
} from '../../foundation.js'
import {
	Query,
	type CountOperationAst,
	type CreateOneOperationAst,
	type ExistsOperationAst,
	type FindOperationAst,
	type FirstOperationAst,
	type GetOperationAst,
	type QueryFilterNode,
} from '../../query/index.js'
import {
	objectField,
	Schema,
	stringField,
	type HookValidationIssue,
} from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
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
		const record = (label: string): void => {
			trace.push(label)
		}
		const schema = new Schema({
			className: 'NativeHookArticle',
			fields: {
				profile: objectField({
					fields: {
						name: stringField({
							hooks: {
								afterCreate: ({ value }) => {
									record(`name:afterCreate:${value}`)
								},
								afterSave: ({ value }) => {
									record(`name:afterSave:${value}`)
								},
								beforeCreate: ({ value }) => {
									record(`name:beforeCreate:${value}`)
								},
								beforeSave: ({ value }) => {
									record(`name:beforeSave:${value}`)
								},
								onChange: ({ change }) => {
									record(`name:onChange:${String(change.current.present)}`)
								},
								resolveInput: ({ value }) => {
									record(`name:resolve:${value}`)

									return value.trim()
								},
								validate: ({ value }) => {
									record(`name:validate:${value}`)

									return []
								},
							},
						}),
					},
					hooks: {
						afterCreate: () => {
							record('profile:afterCreate')
						},
						afterSave: () => {
							record('profile:afterSave')
						},
						beforeCreate: () => {
							record('profile:beforeCreate')
						},
						beforeSave: () => {
							record('profile:beforeSave')
						},
						onChange: () => {
							record('profile:onChange')
						},
						resolveInput: ({ value }) => {
							record(`profile:resolve:${String(value.name)}`)

							return value
						},
						validate: () => {
							record('profile:validate')

							return []
						},
					},
				}),
			},
			hooks: {
				afterCreate: ({ result }) => {
					record('schema:afterCreate')

					return result
				},
				afterOperation: ({ result }) => {
					record('schema:afterOperation')

					return result
				},
				afterSave: ({ result }) => {
					record('schema:afterSave')

					return result
				},
				beforeCreate: ({ operation }) => {
					record('schema:beforeCreate')

					return operation
				},
				beforeOperation: ({ operation }) => {
					record('schema:beforeOperation')

					return operation
				},
				beforeSave: ({ operation }) => {
					record('schema:beforeSave')

					return operation
				},
				resolveInput: ({ operation }) => {
					if (operation.kind === 'create-one') {
						record(`schema:resolve:${String(operation.input.profile?.name)}`)
					}

					return operation
				},
				validate: () => {
					record('schema:validate')

					return []
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
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		let operation = await validate({ context, operation: rawOperation })

		operation = await stages.resolveInput({ context, operation })
		operation = await stages.revalidate({ context, operation })
		await stages.validate({ context, operation })
		operation = await stages.schemaBefore({ context, operation })
		operation = await stages.revalidate({ context, operation })
		await stages.fieldBefore({ context, operation, target: undefined })

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
		const outcome = await stages.fieldAfter({
			context,
			operation,
			outcome: sourceOutcome,
		})
		const result = await stages.schemaAfter({
			context,
			operation,
			result: outcome.result,
		})

		expect(result.profile?.name).toBe('Ada')
		expect(Object.isFrozen(result)).toBe(true)
		expect(trace).toStrictEqual([
			'name:resolve:  Ada  ',
			'profile:resolve:Ada',
			'schema:resolve:Ada',
			'name:validate:Ada',
			'profile:validate',
			'schema:validate',
			'schema:beforeOperation',
			'schema:beforeSave',
			'schema:beforeCreate',
			'profile:beforeSave',
			'profile:beforeCreate',
			'name:beforeSave:Ada',
			'name:beforeCreate:Ada',
			'name:afterCreate:Ada',
			'name:afterSave:Ada',
			'profile:afterCreate',
			'profile:afterSave',
			'name:onChange:true',
			'profile:onChange',
			'schema:afterCreate',
			'schema:afterSave',
			'schema:afterOperation',
		])

		await application.dispose()
	})

	it('aggregates field and schema validation issues with operation paths', async () => {
		const issue = (
			code: HookValidationIssue['code'],
			message: string,
		): HookValidationIssue =>
			immutableRecord({ code, message, path: immutableArray([]) })
		const schema = new Schema({
			className: 'NativeHookValidation',
			fields: {
				title: stringField({
					hooks: {
						validate: () => [issue('article.title', 'Invalid title')],
					},
				}),
			},
			hooks: {
				validate: () => [issue('article.schema', 'Invalid article')],
			},
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const operation = immutableRecord({
			input: {
				createdAt: fixedInstant.toISOString(),
				id: generatedId,
				title: 'invalid',
				updatedAt: fixedInstant.toISOString(),
			},
			kind: 'create-one',
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>

		try {
			await stages.validate({ context, operation })
			expect.unreachable('Expected native hook validation to fail')
		} catch (error: unknown) {
			if (!(error instanceof FrameworkError)) {
				throw error
			}

			const details: unknown = error.publicDetails

			if (!isPlainRecord(details) || !isUnknownArray(details.issues)) {
				throw new TypeError('Expected native hook validation issues', {
					cause: error,
				})
			}

			const paths = details.issues
				.filter(isPlainRecord)
				.map((validationIssue) => validationIssue.path)

			expect(error.code).toBe('VALIDATION_ERROR')
			expect(paths).toContainEqual(['input', 'title'])
			expect(paths).toContainEqual([])
		}

		await application.dispose()
	})

	it('wraps developer schema and field phases with resolved plugin targets', async () => {
		const trace: string[] = []
		const title = stringField({
			hooks: {
				afterCreate: () => {
					trace.push('field:developer:after')
				},
				beforeCreate: () => {
					trace.push('field:developer:before')
				},
			},
		})
		const schema = new Schema({
			className: 'NativeHookPluginOrder',
			fields: { title },
			hooks: {
				afterCreate: ({ result }) => {
					trace.push('schema:developer:after')

					return result
				},
				beforeCreate: ({ operation }) => {
					trace.push('schema:developer:before')

					return operation
				},
			},
		})
		const plugin = definePlugin({
			name: 'fixture.native-hook-order',
			setup: ({ hooks }) => {
				hooks.schema('schema', schema, {
					afterCreate: ({ result }) => {
						trace.push('schema:plugin:after')

						return result
					},
					beforeCreate: ({ operation }) => {
						trace.push('schema:plugin:before')

						return operation
					},
				})
				hooks.field('field', schema, ['title'], {
					afterCreate: () => {
						trace.push('field:plugin:after')
					},
					beforeCreate: () => {
						trace.push('field:plugin:before')
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
			schema: new Query(schema).ast.schema,
		}) satisfies CreateOneOperationAst<typeof schema>
		const transformed = await stages.schemaBefore({ context, operation })

		await stages.fieldBefore({
			context,
			operation: transformed,
			target: undefined,
		})
		const outcome = await stages.fieldAfter({
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
			result: outcome.result,
		})

		expect(trace).toStrictEqual([
			'schema:plugin:before',
			'schema:developer:before',
			'field:plugin:before',
			'field:developer:before',
			'field:developer:after',
			'field:plugin:after',
			'schema:developer:after',
			'schema:plugin:after',
		])

		await application.dispose()
	})

	it('executes read hooks for every terminal and resolves only present selected fields', async () => {
		const trace: string[] = []
		const schema = new Schema({
			className: 'NativeHookRead',
			fields: {
				hidden: stringField({
					hooks: {
						resolveOutput: () => {
							trace.push('field:hidden')

							return 'unexpected'
						},
					},
				}),
				title: stringField({
					hooks: {
						resolveOutput: ({ kind, value }) => {
							trace.push(`field:title:${kind}`)

							return value.toUpperCase()
						},
					},
				}),
			},
			hooks: {
				afterFind: ({ kind, result }) => {
					trace.push(`schema:after:${kind}`)

					return result
				},
				beforeFind: ({ kind, query }) => {
					trace.push(`schema:before:${kind}`)

					return query.equalTo('title', 'visible')
				},
			},
		})
		const application = await createApplication({
			plugins: [],
			schemas: [schema],
		})
		const stages = createNativeHookStages(application)
		const selectedQuery = new Query(schema).select('title')
		const findOperation: FindOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({ kind: 'find', query: selectedQuery.ast })
		const firstOperation: FirstOperationAst<
			typeof schema,
			QueryFilterNode<typeof schema>,
			'title'
		> = immutableRecord({ kind: 'first', query: selectedQuery.ast })
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
				result: resolved,
			})

			expect(result).toStrictEqual(expectedResult)
			expect(transformed.query.where).toMatchObject({
				expression: { field: 'title', kind: 'equal', value: 'visible' },
			})
			expect(transformed.query.selection).toStrictEqual(
				selectedQuery.ast.selection,
			)
		}

		await executeRead(
			operations[0],
			immutableArray([immutableRecord({ title: 'visible' })]),
			[{ title: 'VISIBLE' }],
		)
		await executeRead(operations[1], immutableRecord({ title: 'visible' }), {
			title: 'VISIBLE',
		})
		await executeRead(operations[2], null, null)
		await executeRead(operations[3], 2, 2)
		await executeRead(operations[4], true, true)

		expect(selectedQuery.ast.where).toBeUndefined()
		expect(trace).toStrictEqual([
			'schema:before:find',
			'field:title:find',
			'schema:after:find',
			'schema:before:first',
			'field:title:first',
			'schema:after:first',
			'schema:before:get',
			'schema:after:get',
			'schema:before:count',
			'schema:after:count',
			'schema:before:exists',
			'schema:after:exists',
		])

		await application.dispose()
	})

	it('rejects beforeFind replacements that change schema or selection', async () => {
		const otherSchema = new Schema({
			className: 'NativeHookReadOther',
			fields: { title: stringField() },
		})
		const invalidHooks = [
			() => new Query(otherSchema),
			({ query }: { readonly query: Query<typeof otherSchema> }) =>
				query.select('title'),
		] as const

		for (const invalidHook of invalidHooks) {
			const schema = new Schema({
				className: 'NativeHookReadInvalid',
				fields: { title: stringField() },
				hooks: {
					// The assertion models malformed JavaScript callbacks at Runtime's boundary.
					beforeFind: invalidHook as never,
				},
			})
			const application = await createApplication({
				plugins: [],
				schemas: [schema, otherSchema],
			})
			const stages = createNativeHookStages(application)
			const operation = immutableRecord({
				kind: 'find',
				query: new Query(schema).ast,
			}) satisfies FindOperationAst<typeof schema>

			await expect(
				stages.schemaBefore({ context, operation }),
			).rejects.toBeInstanceOf(TypeError)
			await application.dispose()
		}
	})

	it('rejects values that are not initialized framework applications', () => {
		expect(() => createNativeHookStages(null as never)).toThrow(
			'Native hook stages require a FrameworkApplication',
		)
	})
})
