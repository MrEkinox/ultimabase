import {
	createApplication,
	definePlugin,
	FrameworkError,
} from '../../foundation.js'
import {
	Query,
	type CreateOneOperationAst,
	type ExecutableOperationAst,
	type FindOperationAst,
} from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it, vi } from 'vitest'

import {
	RequestContext,
	createTrustedMasterRequestContext,
	requestSources,
} from '../context/request-context.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'
import {
	constraint,
	databaseConstraint,
	guard,
	restrictInput,
	restrictOutput,
	restrictSelection,
} from './definitions.js'
import { createEnforcementStages } from './dispatcher.js'

const articleSchema = Schema.define({
	className: 'EnforcedArticle',
	fields: {
		secret: stringField(),
		title: stringField({ validation: { required: true } }),
	},
})

const foreignSchema = Schema.define({
	className: 'ForeignEnforcedArticle',
	fields: { title: stringField() },
})

const context = RequestContext.anonymous({
	requestId: 'enforcement-dispatcher',
	source: requestSources.internal,
})

const createOperation = (
	input: CreateOneOperationAst<typeof articleSchema>['input'] = {
		title: 'Allowed',
	},
): CreateOneOperationAst<typeof articleSchema> => ({
	input,
	kind: 'create-one',
	schema: new Query(articleSchema).ast.schema,
})

const requireEnforcementStages = (
	stages: RuntimeEnforcementStages | undefined,
): RuntimeEnforcementStages => {
	if (stages === undefined) {
		throw new TypeError('Expected fixture enforcement stages')
	}

	return stages
}

describe('createEnforcementStages', () => {
	it('skips only contributions that explicitly declare trusted master bypass', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			name: 'fixture.enforcement-master-behavior',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.master-bypassed',
					guard({
						handler: () => {
							trace.push('bypassed')
						},
						master: 'bypass',
					}),
				)
				registries.hooks.register(
					'fixture.master-enforced',
					guard({
						handler: () => {
							trace.push('enforced')
						},
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const master = createTrustedMasterRequestContext(
			'policy bypass test',
			'fixture-key',
			context,
		)
		const operation = createOperation()

		await stages.evaluate({ context: master, operation })
		expect(trace).toStrictEqual(['enforced'])
		await application.dispose()
	})

	it('installs native Access even when no plugin contributes enforcement', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})

		const stages = createEnforcementStages(application)
		expect(typeof stages?.evaluate).toBe('function')
		expect(typeof stages?.enforceOperation).toBe('function')
		await application.dispose()
	})

	it('preserves configuration order across independent policy plugins', async () => {
		const createPolicyPlugin = (name: string, value: string) =>
			definePlugin({
				name,
				setup: ({ registries }) => {
					registries.hooks.register(
						`${name}.constraint`,
						constraint({
							handler: () =>
								databaseConstraint('fixture.ordered-policy', 1, {
									value,
								}),
						}),
					)
				},
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
			name: 'fixture.monotonic-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
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
				registries.hooks.register(
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
				registries.hooks.register(
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
				registries.hooks.register(
					'fixture.input-broad',
					restrictInput({ handler: () => ['title', 'secret'] }),
				)
				registries.hooks.register(
					'fixture.input-narrow',
					restrictInput({ handler: () => ['title'] }),
				)
				registries.hooks.register(
					'fixture.selection-broad',
					restrictSelection({ handler: () => ['id', 'title', 'secret'] }),
				)
				registries.hooks.register(
					'fixture.selection-narrow',
					restrictSelection({ handler: () => ['id', 'title'] }),
				)
				registries.hooks.register(
					'fixture.output-broad',
					restrictOutput({
						handler: (input) => {
							observedOutputInputs.push(input)

							return ['id', 'title']
						},
					}),
				)
				registries.hooks.register(
					'fixture.output-narrow',
					restrictOutput({ handler: () => ['title'] }),
				)
			},
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
		const result = await stages.enforceResult({
			context,
			enforcement,
			operation,
			result: {
				id: 'article-1',
				secret: 'hidden',
				title: 'Allowed',
				createdAt: '2026-08-02T00:00:00.000Z',
				updatedAt: '2026-08-02T00:00:00.000Z',
			},
		})

		expect(enforced.constraints).toStrictEqual([
			{ kind: 'fixture.tenant', version: 1, payload: { tenantId: 'tenant-1' } },
			{ kind: 'fixture.visibility', version: 1, payload: { published: true } },
		])
		expect(selectionResult).toStrictEqual({ id: 'article-1', title: 'Allowed' })
		expect(result).toStrictEqual({ title: 'Allowed' })
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
			name: 'fixture.input-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.only-title',
					restrictInput({ handler: () => ['title'] }),
				)
			},
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
			name: 'fixture.selection-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.selection-broad',
					restrictSelection({
						schema: articleSchema,
						handler: () => ['id', 'title'],
					}),
				)
				registries.hooks.register(
					'fixture.selection-narrow',
					restrictSelection({
						schema: articleSchema,
						handler: () => ['title'],
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const operation: FindOperationAst<typeof articleSchema> = {
			kind: 'find',
			query: new Query(articleSchema).select('id', 'title', 'secret').ast,
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

		await application.dispose()
	})

	it('preserves the exact denial and stops later contributions', async () => {
		const denial = new FrameworkError(
			'PERMISSION_DENIED',
			'Fixture policy denied the operation',
		)
		const laterHandler = vi.fn()
		const plugin = definePlugin({
			name: 'fixture.denied-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.denied',
					guard({
						handler: () => {
							throw denial
						},
					}),
				)
				registries.hooks.register(
					'fixture.not-reached',
					guard({ handler: laterHandler }),
				)
			},
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
			name: 'fixture.cancelled-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.cancel-request',
					guard({
						handler: () => {
							controller.abort()
						},
					}),
				)
				registries.hooks.register(
					'fixture.not-reached-after-cancellation',
					guard({ handler: laterHandler }),
				)
			},
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
			name: 'fixture.recursive-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
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
			},
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
		).rejects.toMatchObject({ code: 'HOOK_RECURSION' })

		await application.dispose()
	})

	it('retains pre-transform constraints when reevaluating transformed values', async () => {
		const plugin = definePlugin({
			name: 'fixture.value-derived-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.title-constraint',
					constraint({
						schema: articleSchema,
						operations: ['create-one'],
						handler: ({ operation }) =>
							databaseConstraint('fixture.input-title', 1, {
								title: operation.input.title,
							}),
					}),
				)
			},
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

	it('rejects excluded input across every create, update, and upsert shape', async () => {
		const plugin = definePlugin({
			name: 'fixture.all-mutation-inputs',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.title-only',
					restrictInput({
						schema: articleSchema,
						handler: () => ['title'],
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = requireEnforcementStages(
			createEnforcementStages(application),
		)
		const query = new Query(articleSchema).ast
		const schema = query.schema
		const update = {
			kind: 'update-expression',
			operations: [{ field: 'secret', kind: 'set', value: 'blocked' }],
		} as const
		const target = {
			fields: ['id'],
			kind: 'unique-upsert-target',
		} as const
		const blockedInput = { secret: 'blocked', title: 'Allowed' }
		const operations = [
			{ input: blockedInput, kind: 'create-one', schema },
			{
				inputs: [blockedInput],
				kind: 'create-many',
				options: { atomic: true },
				schema,
			},
			{ kind: 'update-one', query, update },
			{ kind: 'update-many', query, update },
			{
				create: blockedInput,
				kind: 'upsert-one',
				query,
				target,
				update,
			},
			{
				items: [{ create: blockedInput, query, target, update }],
				kind: 'upsert-many',
				options: { atomic: true },
				schema,
			},
		] as const satisfies readonly ExecutableOperationAst<typeof articleSchema>[]

		for (const operation of operations) {
			const enforcement = await stages.evaluate({ context, operation })

			expect(() =>
				stages.enforceOperation({ context, enforcement, operation }),
			).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
		}

		await application.dispose()
	})

	it.each([
		[
			'guard result',
			guard({ handler: (() => true) as never }),
			'must return undefined',
		],
		[
			'forged constraint',
			constraint({
				handler: () => ({
					kind: 'fixture.forged',
					version: 1,
					payload: null,
				}),
			}),
			'must be a database constraint node',
		],
		[
			'unknown field',
			restrictSelection({ handler: () => ['missing'] }),
			'returned an unknown schema field',
		],
	] as const)(
		'rejects invalid %s from JavaScript plugins',
		async (_label, definition, message) => {
			const plugin = definePlugin({
				name: 'fixture.invalid-enforcement',
				setup: ({ registries }) => {
					registries.hooks.register('fixture.invalid', definition)
				},
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
			).rejects.toThrow(message)

			await application.dispose()
		},
	)

	it('rejects foreign schema scopes during application assembly', async () => {
		const plugin = definePlugin({
			name: 'fixture.foreign-enforcement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.foreign',
					guard({ schema: foreignSchema, handler: vi.fn() }),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})

		expect(() => createEnforcementStages(application)).toThrow(
			'Enforcement contribution "fixture.foreign" references a schema outside its application',
		)

		await application.dispose()
	})
})
