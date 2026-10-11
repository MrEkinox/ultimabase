import { FrameworkError } from '../../foundation.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { createApplication } from '../../application/framework-application.js'
import {
	type CreateOneOperationAst,
	type FindManyOperationAst,
} from '../../query/index.js'

import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'
import { createTestRuntimeConstraints } from '../../../tests/runtime/fixtures/runtime-capabilities.js'

import { RequestContext, requestSources } from '../context/request-context.js'
import { createFixtureMasterContext } from '../../../tests/fixtures/master-context.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'
import {
	readRuntimeSchemaModelMetadata,
	retainRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import { guard } from './definitions.js'
import { protectedPolicy } from './protected-policy.js'
import { createEnforcementStages } from './dispatcher.js'
import {
	articleSchema,
	context,
	createOperation,
	requireEnforcementStages,
	runtimeConstrainPrivileges,
} from '../../../tests/fixtures/enforcement-dispatcher.js'
import { QueryBuilder } from '../../plugin.js'
const constrainReason = runtimeConstrainPrivileges[0].reason
describe('createEnforcementStages', () => {
	it('skips only contributions that explicitly declare trusted master bypass', async () => {
		const trace: string[] = []
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.enforcement-master-behavior',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.master-bypassed',
					guard({
						handler: () => {
							trace.push('bypassed')
						},
						master: 'bypass',
					}),
				)
				provide(
					'fixture.master-enforced',
					guard({
						handler: () => {
							trace.push('enforced')
						},
					}),
				)
				provide(
					'fixture.master-output-bypassed',
					protectedPolicy({
						restrictResult: ({ result }) => {
							trace.push('output-bypassed')

							return result
						},
						master: 'bypass',
					}),
				)
				provide(
					'fixture.master-output-enforced',
					protectedPolicy({
						restrictResult: ({ result }) => {
							trace.push('output-enforced')

							return result
						},
					}),
				)
			}),
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const master = createFixtureMasterContext(
			'policy bypass test',
			'fixture-key',
			context,
		)
		const operation = createOperation()

		await stages.evaluate({ context: master, operation })
		expect(trace).toStrictEqual(['enforced'])
		const enforcement = await stages.evaluate({
			context: master,
			operation,
		})
		await stages.enforceResult({
			context: master,
			enforcement,
			operation,
			result: { title: 'Visible' },
		})
		expect(trace).toStrictEqual(['enforced', 'enforced', 'output-enforced'])
		await application.dispose()
	})

	it('allocates no enforcement stages when no plugin contributes policy', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})

		const stages = createEnforcementStages(application)
		expect(stages).toBeUndefined()
		await application.dispose()
	})

	it('preserves configuration order across independent policy plugins', async () => {
		const order: string[] = []
		const createPolicyPlugin = (name: string, value: string) =>
			createPlugin({
				version: '0.0.0',
				core: '^0.0.0',
				id: name,
				permissions: { 'runtime:constrain': constrainReason },
				contributions: createTestRuntimeConstraints((provide) => {
					provide(
						`${name}.constraint`,
						protectedPolicy({
							evaluate: () => {
								order.push(value)
								return undefined
							},
						}),
					)
				}),
			})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [
				createPolicyPlugin('fixture.first-policy', 'first'),
				createPolicyPlugin('fixture.second-policy', 'second'),
			],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const operation = createOperation()
		await stages.evaluate({ context, operation })

		expect(order).toStrictEqual(['first', 'second'])

		await application.dispose()
	})

	it('accumulates independent effects once and reapplies their intersections', async () => {
		const trace: string[] = []
		const observedInputs: unknown[] = []
		const observedOutputInputs: unknown[] = []
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.monotonic-enforcement',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.guard',
					guard({
						schema: articleSchema,
						operations: ['create-one'],
						handler: (input) => {
							trace.push('guard')
							observedInputs.push(input)
						},
					}),
				)
				provide(
					'fixture.tenant',
					protectedPolicy({
						schema: articleSchema,
						evaluate: () => {
							trace.push('policy:tenant')

							return undefined
						},
					}),
				)
				provide(
					'fixture.visibility',
					protectedPolicy({
						evaluate: () => {
							trace.push('policy:visibility')

							return {}
						},
					}),
				)
				provide(
					'fixture.input-broad',
					protectedPolicy({
						evaluate: () => ({ inputFields: ['title', 'secret'] }),
					}),
				)
				provide(
					'fixture.input-narrow',
					protectedPolicy({ evaluate: () => ({ inputFields: ['title'] }) }),
				)
				provide(
					'fixture.selection-broad',
					protectedPolicy({
						evaluate: () => ({ selectionFields: ['id', 'title', 'secret'] }),
					}),
				)
				provide(
					'fixture.selection-narrow',
					protectedPolicy({
						evaluate: () => ({ selectionFields: ['id', 'title'] }),
					}),
				)
				provide(
					'fixture.output-observer',
					protectedPolicy({
						restrictResult: (input) => {
							observedOutputInputs.push(input)

							return input.result
						},
					}),
				)
			}),
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const operation = createOperation()

		const enforcement = await stages.evaluate({ context, operation })

		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})
		const selectionResult = await stages.enforceSelectionResult({
			context,
			enforcement,
			operation,
			result: {
				createdAt: '2026-08-02T00:00:00.000Z',
				id: 'article-1',
				secret: 'hidden',
				title: 'Allowed',
				updatedAt: '2026-08-02T00:00:00.000Z',
			},
		})
		const protectedResult = immutableRecord({
			id: 'article-1',
			secret: 'hidden',
			title: 'Allowed',
			createdAt: '2026-08-02T00:00:00.000Z',
			updatedAt: '2026-08-02T00:00:00.000Z',
		})

		retainRuntimeSchemaModelMetadata(
			operation,
			immutableArray(['article-1']),
			protectedResult,
			undefined,
		)

		const result = await stages.enforceResult({
			context,
			enforcement,
			operation,
			result: protectedResult,
		})

		// Protected policies no longer carry adapter constraint nodes.
		expect(enforced).not.toHaveProperty('constraints')
		expect(selectionResult).toStrictEqual({ id: 'article-1', title: 'Allowed' })
		// The final projection reapplies the selection intersection after transforms.
		expect(result).toStrictEqual({ id: 'article-1', title: 'Allowed' })
		expect(readRuntimeSchemaModelMetadata(result)).toStrictEqual({
			objectId: 'article-1',
			selectedFields: ['id', 'title'],
		})
		expect(trace).toStrictEqual(['guard', 'policy:tenant', 'policy:visibility'])
		expect(Object.keys(observedInputs[0] ?? {})).toStrictEqual([
			'context',
			'operation',
		])
		expect(Object.keys(observedOutputInputs[0] ?? {})).toStrictEqual([
			'context',
			'operation',
			'result',
		])

		// Applying the private plan twice must not rerun contribution callbacks.
		await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})
		expect(trace).toStrictEqual(['guard', 'policy:tenant', 'policy:visibility'])

		await application.dispose()
	})

	it('rejects restricted mutation input with a stable permission error', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.input-enforcement',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.only-title',
					protectedPolicy({ evaluate: () => ({ inputFields: ['title'] }) }),
				)
			}),
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const operation = createOperation({ secret: 'blocked', title: 'Allowed' })
		const enforcement = await stages.evaluate({ context, operation })

		expect(() =>
			stages.enforceOperation({
				context,
				enforcement,
				operation,
			}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PERMISSION_DENIED',
			}),
		)

		await application.dispose()
	})

	it('materializes the intersection over explicit query selections', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.selection-enforcement',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.selection-broad',
					protectedPolicy({
						schema: articleSchema,
						evaluate: () => ({ selectionFields: ['id', 'title'] }),
					}),
				)
				provide(
					'fixture.selection-narrow',
					protectedPolicy({
						schema: articleSchema,
						evaluate: () => ({ selectionFields: ['title'] }),
					}),
				)
			}),
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const operation: FindManyOperationAst<typeof articleSchema> = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).select({
				id: true,
				title: true,
				secret: true,
			}).ast,
		}
		const enforcement = await stages.evaluate({ context, operation })
		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})

		expect(enforced.operation.query.selection.fields).toStrictEqual([
			{ field: 'title', kind: 'selected-field' },
		])
		expect(Object.isFrozen(enforced.operation.query.selection.fields)).toBe(
			true,
		)
		const createOperation: CreateOneOperationAst<
			typeof articleSchema,
			'id' | 'secret' | 'title'
		> = {
			input: { title: 'Created' },
			kind: 'create-one',
			selection: {
				fields: [
					{ field: 'id', kind: 'selected-field' },
					{ field: 'title', kind: 'selected-field' },
					{ field: 'secret', kind: 'selected-field' },
				],
				kind: 'selection',
			},
			schema: new QueryBuilder(articleSchema).ast.schema,
		}
		const createEnforcement = await stages.evaluate({
			context,
			operation: createOperation,
		})
		const enforcedCreate = await stages.enforceOperation({
			context,
			enforcement: createEnforcement,
			operation: createOperation,
		})

		expect(enforcedCreate.operation.selection.fields).toStrictEqual([
			{ field: 'title', kind: 'selected-field' },
		])
		expect(Object.isFrozen(enforcedCreate.operation.selection.fields)).toBe(
			true,
		)
		const selectedQuery = new QueryBuilder(articleSchema).select({
			id: true,
			secret: true,
			title: true,
		}).ast
		const upsertManyOperation = {
			items: [
				{
					create: { title: 'Created' },
					query: selectedQuery,
					target: { fields: ['id'], kind: 'unique-upsert-target' },
					update: { kind: 'update-expression', operations: [] },
				},
			],
			kind: 'upsert-many',
			selection: selectedQuery.selection,
			schema: selectedQuery.schema,
		} as const
		const upsertManyEnforcement = await stages.evaluate({
			context,
			operation: upsertManyOperation,
		})
		const enforcedUpsertMany = await stages.enforceOperation({
			context,
			enforcement: upsertManyEnforcement,
			operation: upsertManyOperation,
		})

		expect(enforcedUpsertMany.operation.selection.fields).toStrictEqual([
			{ field: 'title', kind: 'selected-field' },
		])
		expect(
			enforcedUpsertMany.operation.items[0].query.selection.fields,
		).toStrictEqual([{ field: 'title', kind: 'selected-field' }])

		await application.dispose()
	})

	it('preserves the exact denial and stops later contributions', async () => {
		const denial = new FrameworkError(
			'PERMISSION_DENIED',
			'Fixture policy denied the operation',
		)
		const laterHandler = vi.fn()
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.denied-enforcement',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.denied',
					guard({
						handler: () => {
							throw denial
						},
					}),
				)
				provide('fixture.not-reached', guard({ handler: laterHandler }))
			}),
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)

		await expect(
			stages.evaluate({ context, operation: createOperation() }),
		).rejects.toBe(denial)
		expect(laterHandler).not.toHaveBeenCalled()

		await application.dispose()
	})

	it('stops later enforcement hooks when request cancellation is observed', async () => {
		const controller = new AbortController()
		const laterHandler = vi.fn()
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.cancelled-enforcement',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.cancel-request',
					guard({
						handler: () => {
							controller.abort()
						},
					}),
				)
				provide(
					'fixture.not-reached-after-cancellation',
					guard({ handler: laterHandler }),
				)
			}),
		})
		const application = await createApplication({
			plugins: [plugin],
			schemas: [articleSchema],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const cancelledContext = RequestContext.anonymous({
			requestId: 'cancelled-enforcement',
			signal: controller.signal,
			source: requestSources.internal,
		})

		await expect(
			stages.evaluate({
				context: cancelledContext,
				operation: createOperation(),
			}),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(laterHandler).not.toHaveBeenCalled()

		await application.dispose()
	})

	it('rejects recursive enforcement reached through the shared executor', async () => {
		const stagesReference: { current: RuntimeEnforcementStages | undefined } = {
			current: undefined,
		}
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.recursive-enforcement',
			permissions: { 'runtime:constrain': constrainReason },
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.recursive-guard',
					guard({
						handler: async (input) => {
							if (stagesReference.current === undefined) {
								throw new TypeError('Expected active enforcement stages')
							}

							await stagesReference.current.evaluate(input)
						},
					}),
				)
			}),
		})
		const application = await createApplication({
			plugins: [plugin],
			schemas: [articleSchema],
		})

		stagesReference.current = requireEnforcementStages(
			createEnforcementStages(application),
		)
		await expect(
			stagesReference.current.evaluate({
				context,
				operation: createOperation(),
			}),
		).rejects.toMatchObject({ code: 'RUNTIME_CALLBACK_RECURSION' })

		await application.dispose()
	})
})
