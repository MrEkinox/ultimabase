import {
	createApplication,
	definePlugin,
	FrameworkError,
} from '../../foundation.js'
import {
	QueryBuilder,
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
import {
	constraint,
	databaseConstraint,
	guard,
	restrictInput,
	restrictOutput,
	restrictSelection,
} from './definitions.js'
import { createEnforcementStages } from './dispatcher.js'
import {
	articleSchema,
	context,
	createOperation,
	requireEnforcementStages,
	runtimeConstrainPrivileges,
} from '../../../tests/fixtures/enforcement-dispatcher.js'

describe('createEnforcementStages', () => {
	it('skips only contributions that explicitly declare trusted master bypass', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.enforcement-master-behavior',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
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
					restrictOutput({
						handler: () => {
							trace.push('output-bypassed')

							return []
						},
						master: 'bypass',
					}),
				)
				provide(
					'fixture.master-output-enforced',
					restrictOutput({
						handler: () => {
							trace.push('output-enforced')

							return ['title']
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
		const createPolicyPlugin = (name: string, value: string) =>
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: name,
				privileges: runtimeConstrainPrivileges,
				capabilities: createTestRuntimeConstraints((provide) => {
					provide(
						`${name}.constraint`,
						constraint({
							handler: () =>
								databaseConstraint('fixture.ordered-policy', 1, {
									value,
								}),
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
		const enforcement = await stages.evaluate({ context, operation })
		const result = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})

		expect(result.constraints).toStrictEqual([
			{
				kind: 'fixture.ordered-policy',
				version: 1,
				payload: { value: 'first' },
			},
			{
				kind: 'fixture.ordered-policy',
				version: 1,
				payload: { value: 'second' },
			},
		])

		await application.dispose()
	})

	it('accumulates independent effects once and reapplies their intersections', async () => {
		const trace: string[] = []
		const observedInputs: unknown[] = []
		const observedOutputInputs: unknown[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.monotonic-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
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
					constraint({
						schema: articleSchema,
						handler: () => {
							trace.push('constraint:tenant')

							return databaseConstraint('fixture.tenant', 1, {
								tenantId: 'tenant-1',
							})
						},
					}),
				)
				provide(
					'fixture.visibility',
					constraint({
						handler: () => {
							trace.push('constraint:visibility')

							return databaseConstraint('fixture.visibility', 1, {
								published: true,
							})
						},
					}),
				)
				provide(
					'fixture.input-broad',
					restrictInput({ handler: () => ['title', 'secret'] }),
				)
				provide(
					'fixture.input-narrow',
					restrictInput({ handler: () => ['title'] }),
				)
				provide(
					'fixture.selection-broad',
					restrictSelection({ handler: () => ['id', 'title', 'secret'] }),
				)
				provide(
					'fixture.selection-narrow',
					restrictSelection({ handler: () => ['id', 'title'] }),
				)
				provide(
					'fixture.output-broad',
					restrictOutput({
						handler: (input) => {
							observedOutputInputs.push(input)

							return ['id', 'title']
						},
					}),
				)
				provide(
					'fixture.output-narrow',
					restrictOutput({ handler: () => ['title'] }),
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

		expect(enforced.constraints).toStrictEqual([
			{ kind: 'fixture.tenant', version: 1, payload: { tenantId: 'tenant-1' } },
			{ kind: 'fixture.visibility', version: 1, payload: { published: true } },
		])
		expect(selectionResult).toStrictEqual({ id: 'article-1', title: 'Allowed' })
		expect(result).toStrictEqual({ title: 'Allowed' })
		expect(readRuntimeSchemaModelMetadata(result)).toStrictEqual({
			objectId: 'article-1',
			selectedFields: ['title'],
		})
		expect(trace).toStrictEqual([
			'guard',
			'constraint:tenant',
			'constraint:visibility',
		])
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
		expect(trace).toStrictEqual([
			'guard',
			'constraint:tenant',
			'constraint:visibility',
		])

		await application.dispose()
	})

	it('rejects restricted mutation input with a stable permission error', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.input-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.only-title',
					restrictInput({ handler: () => ['title'] }),
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
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.selection-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.selection-broad',
					restrictSelection({
						schema: articleSchema,
						handler: () => ['id', 'title'],
					}),
				)
				provide(
					'fixture.selection-narrow',
					restrictSelection({
						schema: articleSchema,
						handler: () => ['title'],
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
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.denied-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
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
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.cancelled-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
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
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.recursive-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
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

	it('retains pre-transform constraints when reevaluating transformed values', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.value-derived-enforcement',
			privileges: runtimeConstrainPrivileges,
			capabilities: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.title-constraint',
					constraint({
						schema: articleSchema,
						operations: ['create-one'],
						handler: ({ operation }) => {
							const title: unknown = operation.input.title
							if (typeof title !== 'string') {
								throw new TypeError('Expected a string title constraint')
							}
							return databaseConstraint('fixture.input-title', 1, { title })
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
		const initialOperation = createOperation({ title: 'Initial' })
		const initialState = await stages.evaluate({
			context,
			operation: initialOperation,
		})
		const transformedOperation = createOperation({ title: 'Transformed' })
		const reevaluatedState = await stages.reevaluate({
			context,
			enforcement: initialState,
			operation: transformedOperation,
		})
		const enforced = await stages.enforceOperation({
			context,
			enforcement: reevaluatedState,
			operation: transformedOperation,
		})

		expect(enforced.constraints).toStrictEqual([
			{
				kind: 'fixture.input-title',
				version: 1,
				payload: { title: 'Initial' },
			},
			{
				kind: 'fixture.input-title',
				version: 1,
				payload: { title: 'Transformed' },
			},
		])

		await application.dispose()
	})
})
