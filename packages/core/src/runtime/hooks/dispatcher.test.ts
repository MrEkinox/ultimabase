import {
	createApplication,
	definePlugin,
	FrameworkError,
} from '../../foundation.js'
import { Query, type CreateOneOperationAst } from '../../query/index.js'
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
import type { DatabaseOperationOutcome } from '../database/contracts.js'
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

	it('rejects values that are not initialized framework applications', () => {
		expect(() => createNativeHookStages(null as never)).toThrow(
			'Native hook stages require a FrameworkApplication',
		)
	})
})
