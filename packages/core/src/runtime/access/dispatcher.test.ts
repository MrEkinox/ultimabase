import { createApplication, definePlugin } from '../../foundation.js'
import {
	QueryBuilder,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type FindManyOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import {
	Schema,
	booleanField,
	intField,
	objectField,
	relationField,
	stringField,
} from '../../schema/index.js'
import { isSchemaModelInstance } from '../../schema/schema/model.js'
import { describe, expect, it, vi } from 'vitest'

import { createEnforcementStages } from '../enforcement/dispatcher.js'
import {
	RequestContext,
	createTrustedMasterRequestContext,
	requestSources,
} from '../context/request-context.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'

const accessTrace: string[] = []
const articleSchema = Schema.define({
	className: 'NativeAccessArticle',
	access: {
		read: {
			allow: {
				count: false,
				exists: true,
				many: () => {
					accessTrace.push('many')
					return true
				},
				one: true,
			},
			where: ({ where }) => where.eq('published', true),
		},
		update: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
			item: ({ originalItem, item }) =>
				item.title === 'Changed' && originalItem.published === true,
		},
	},
	fields: {
		published: booleanField(),
		secret: stringField({
			access: {
				read: {
					orderBy: false,
					output: ({ value }) => value !== 'hidden',
					where: false,
				},
				write: false,
			},
		}),
		title: stringField({ validation: { required: true } }),
	},
})

const context = RequestContext.anonymous({
	requestId: 'native-access-runtime',
	source: requestSources.internal,
})

const requireStages = (
	stages: RuntimeEnforcementStages | undefined,
): RuntimeEnforcementStages => {
	if (stages === undefined) {
		throw new TypeError('Native Access stages are required')
	}

	return stages
}

const createFind = (
	query: QueryBuilder<typeof articleSchema> = new QueryBuilder(articleSchema),
): FindManyOperationAst<typeof articleSchema> => ({
	kind: 'find-many',
	query: query.ast,
})

describe('NativeAccessRuntime', () => {
	it('never materializes relation handles when field Access narrows select-all', async () => {
		const target = Schema.define({
			className: 'NativeAccessSelectionTarget',
			fields: { label: stringField() },
		})
		const source = Schema.define({
			className: 'NativeAccessSelectionSource',
			fields: {
				denied: stringField({ access: { read: false } }),
				targets: relationField({ target: () => target }),
				title: stringField(),
			},
		})
		const application = await createApplication({
			schemas: [source, target],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(source).ast,
		} as const
		const enforcement = await stages.evaluate({ context, operation })
		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})
		const selected = enforced.operation.query.selection.fields.map(
			({ field }) => field,
		)

		expect(selected).toContain('title')
		expect(selected).not.toContain('denied')
		expect(selected).not.toContain('targets')
		await application.dispose()
	})

	it('dispatches the grouped read branch and keeps row filters outside the QueryBuilder AST', async () => {
		accessTrace.length = 0
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = createFind(
			new QueryBuilder(articleSchema).where((where) =>
				where.eq('title', 'Public'),
			),
		)
		const originalQuery = operation.query
		const enforcement = await stages.evaluate({ context, operation })
		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})

		expect(accessTrace).toStrictEqual(['many'])
		expect(enforced.operation.query.where).toBe(originalQuery.where)
		expect(enforced.rowFilter).toMatchObject({
			field: 'published',
			kind: 'equal',
			value: true,
		})
		await application.dispose()
	})

	it('plans trusted relational row filters without granting public field filtering', async () => {
		const target = Schema.define({
			className: 'NativeAccessPolicyTarget',
			access: {
				read: { where: { visible: { eq: true } } },
			},
			fields: {
				label: stringField({
					access: { read: { orderBy: false, output: true, where: false } },
				}),
				visible: booleanField({
					access: { read: { orderBy: false, output: false, where: false } },
				}),
			},
		})
		const source = Schema.define({
			className: 'NativeAccessPolicySource',
			access: {
				read: {
					where: {
						targets: { some: { label: { eq: 'policy-visible' } } },
					},
				},
			},
			fields: {
				targets: relationField({
					access: { read: false },
					target: () => target,
				}),
				title: stringField(),
			},
		})
		const application = await createApplication({
			schemas: [source, target],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(source).select({ title: true }).ast,
		} as const
		const enforcement = await stages.evaluate({ context, operation })
		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})
		const [scope] = enforced.relationPredicates ?? []

		expect(enforced.rowFilter).toMatchObject({
			field: 'targets',
			kind: 'relation-predicate',
			operator: 'some',
		})
		expect(scope?.predicate).toBe(enforced.rowFilter)
		expect(scope?.rowFilter).toMatchObject({
			field: 'visible',
			kind: 'equal',
			value: true,
		})
		await application.dispose()
	})

	it('denies operation and indirect field disclosure before database work', async () => {
		const selectionSchema = Schema.define({
			className: 'NativeAccessBulkSelection',
			fields: {
				denied: stringField({ access: { read: false } }),
				title: stringField(),
			},
		})
		const application = await createApplication({
			schemas: [articleSchema, selectionSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const count = {
			kind: 'count',
			query: new QueryBuilder(articleSchema).ast,
		} as const

		await expect(
			stages.evaluate({ context, operation: count }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			stages.evaluate({
				context,
				operation: createFind(
					new QueryBuilder(articleSchema).where((where) =>
						where.eq('secret', 'guess'),
					),
				),
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			stages.evaluate({
				context,
				operation: createFind(
					new QueryBuilder(articleSchema).ascending('secret'),
				),
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		const selectedBulkCreate: CreateManyOperationAst<
			typeof selectionSchema,
			'denied'
		> = {
			inputs: [{ title: 'Allowed input' }],
			kind: 'create-many',
			selection: new QueryBuilder(selectionSchema).select({ denied: true }).ast
				.selection,
			schema: new QueryBuilder(selectionSchema).ast.schema,
		}
		await expect(
			stages.evaluate({ context, operation: selectedBulkCreate }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await application.dispose()
	})

	it('rejects forbidden mutation input and evaluates set-based item callbacks per target', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const create: CreateOneOperationAst<typeof articleSchema> = {
			input: { secret: 'private', title: 'Draft' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(articleSchema).ast.schema,
		}
		const updateMany: UpdateManyOperationAst<typeof articleSchema> = {
			kind: 'update-many',
			query: new QueryBuilder(articleSchema).ast,
			update: {
				kind: 'update-expression',
				operations: [{ field: 'title', kind: 'set', value: 'Changed' }],
			},
		}

		await expect(
			stages.evaluate({ context, operation: create }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await stages.evaluate({ context, operation: updateMany })
		expect(stages.requiresPreparedMutationItems?.(updateMany)).toBe(true)
		await expect(
			stages.enforcePreparedMutation?.({
				context,
				operation: updateMany,
				target: undefined,
				targets: [
					{
						createdAt: '2026-08-03T00:00:00.000Z',
						id: '0198a43e-2431-7000-8000-000000000010',
						published: true,
						secret: null,
						title: 'Original',
						updatedAt: '2026-08-03T00:00:00.000Z',
					},
					{
						createdAt: '2026-08-03T00:00:00.000Z',
						id: '0198a43e-2431-7000-8000-000000000011',
						published: false,
						secret: null,
						title: 'Original',
						updatedAt: '2026-08-03T00:00:00.000Z',
					},
				],
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await application.dispose()
	})

	it('materializes draft and persisted schema item Access values once per decision', async () => {
		const createItems: object[] = []
		const updateItems: object[] = []
		const updateOriginalItems: object[] = []
		const fieldValues: [number | null, number | null][] = []
		const schema = Schema.define({
			className: 'MaterializedAccessItem',
			access: {
				create: {
					item: (input) => {
						const { item } = input
						expect(item.get('title')).toBe('Draft')
						expect(input).not.toHaveProperty('kind')
						createItems.push(item)

						return true
					},
				},
				update: {
					item: (input) => {
						const { originalItem, item } = input
						expect(originalItem.get('title')).toBe('Persisted')
						expect(item.title).toBe('Updated')
						expect(item.visits).toBe(15)
						expect(input).not.toHaveProperty('kind')
						updateOriginalItems.push(originalItem)
						updateItems.push(item)

						return true
					},
				},
			},
			fields: {
				visits: intField({
					access: {
						write: {
							create: true,
							update: {
								clear: true,
								fill: true,
								replace: ({ originalValue, value }) => {
									fieldValues.push([originalValue, value])

									return value <= 20
								},
							},
						},
					},
				}),
				title: stringField({
					access: {
						write: {
							create: (input) => !Object.hasOwn(input, 'kind'),
							update: {
								clear: true,
								fill: true,
								replace: (input) => !Object.hasOwn(input, 'kind'),
							},
						},
					},
					validation: { required: true },
				}),
			},
		})
		const contribution = definePlugin({
			name: 'fixture.materialized-access-item',
			setup: ({ access }) => {
				access.schema(
					'materialized-items',
					schema,
					{
						create: {
							item: (input) => {
								const { item } = input
								expect(input).not.toHaveProperty('kind')
								createItems.push(item)

								return true
							},
						},
						update: {
							item: (input) => {
								const { originalItem, item } = input
								expect(input).not.toHaveProperty('kind')
								updateOriginalItems.push(originalItem)
								updateItems.push(item)

								return true
							},
						},
					},
					{ master: 'enforce' },
				)
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [contribution],
		})
		const stages = requireStages(createEnforcementStages(application))
		const record = {
			createdAt: '2026-08-03T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000020',
			title: 'Draft',
			updatedAt: '2026-08-03T00:00:00.000Z',
			visits: 10,
		} as const
		const create = {
			input: record,
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		} satisfies CreateOneOperationAst<typeof schema>

		await stages.evaluate({ context, operation: create })

		const update = {
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: {
				kind: 'update-expression',
				operations: [
					{ field: 'title', kind: 'set', value: 'Updated' },
					{ field: 'visits', kind: 'increment', value: 5 },
				],
			},
		} satisfies UpdateOneOperationAst<typeof schema>
		const persisted = { ...record, title: 'Persisted' }
		const enforcePreparedMutation = stages.enforcePreparedMutation
		await stages.evaluate({ context, operation: update })

		if (enforcePreparedMutation === undefined) {
			throw new TypeError('Native Access prepared mutation stage is required')
		}

		await enforcePreparedMutation({
			context,
			operation: update,
			target: persisted,
		})

		expect(createItems).toHaveLength(2)
		expect(createItems[0]).toBe(createItems[1])
		expect(updateItems).toHaveLength(2)
		expect(updateItems[0]).toBe(updateItems[1])
		expect(updateOriginalItems).toHaveLength(2)
		expect(updateOriginalItems[0]).toBe(updateOriginalItems[1])
		expect(fieldValues).toStrictEqual([[10, 15]])
		const [createItem] = createItems
		const [updateItem] = updateItems

		if (createItem === undefined || updateItem === undefined) {
			throw new TypeError('Materialized Access item callbacks must execute')
		}

		expect(isSchemaModelInstance(schema, createItem)).toBe(true)
		expect(isSchemaModelInstance(schema, updateItem)).toBe(false)
		expect(Object.isFrozen(updateItem)).toBe(true)

		await expect(
			enforcePreparedMutation({
				context,
				operation: update,
				target: { ...persisted, visits: 18 },
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(fieldValues).toStrictEqual([
			[10, 15],
			[18, 23],
		])

		await application.dispose()
	})

	it('classifies asynchronous field writes from persisted and final values', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'FieldWriteTransitionAccess',
			fields: {
				count: intField({
					access: {
						write: {
							create: async ({ value }) => {
								await Promise.resolve()
								trace.push(`create:${String(value)}`)

								return true
							},
							update: {
								clear: async ({ originalValue }) => {
									await Promise.resolve()
									trace.push(`clear:${String(originalValue)}`)

									return true
								},
								fill: async ({ value }) => {
									await Promise.resolve()
									trace.push(`fill:${String(value)}`)

									return true
								},
								replace: async ({ originalValue, value }) => {
									await Promise.resolve()
									trace.push(
										`replace:${String(originalValue)}:${String(value)}`,
									)

									return true
								},
							},
						},
					},
				}),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const create = {
			input: { count: 1 },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		} satisfies CreateOneOperationAst<typeof schema>
		const update = (
			operation: UpdateOneOperationAst<
				typeof schema
			>['update']['operations'][number],
		): UpdateOneOperationAst<typeof schema> => ({
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: { kind: 'update-expression', operations: [operation] },
		})
		const record = (count: number | null) => ({
			count,
			createdAt: '2026-08-08T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000021',
			updatedAt: '2026-08-08T00:00:00.000Z',
		})
		const fill = update({ field: 'count', kind: 'set', value: 2 })
		const replace = update({ field: 'count', kind: 'increment', value: 3 })
		const clear = update({ field: 'count', kind: 'set', value: null })

		await stages.evaluate({ context, operation: create })
		for (const [operation, target] of [
			[fill, record(null)],
			[replace, record(2)],
			[clear, record(5)],
			[clear, record(null)],
		] as const) {
			await stages.evaluate({ context, operation })
			await stages.enforcePreparedMutation?.({ context, operation, target })
		}

		expect(trace).toStrictEqual([
			'create:1',
			'fill:2',
			'replace:2:5',
			'clear:5',
			'clear:null',
		])
		await application.dispose()
	})

	it('evaluates nested create Access once per concrete object-list value', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'NestedFieldCreateAccess',
			fields: {
				groups: objectField({
					access: {
						write: {
							create: () => {
								trace.push('groups')

								return true
							},
							update: true,
						},
					},
					fields: {
						label: stringField({
							access: {
								write: {
									create: ({ value }) => {
										trace.push(`label:${String(value)}`)

										return value !== 'forbidden'
									},
									update: true,
								},
							},
						}),
					},
					list: [true, true],
				}),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const create = (label: string): CreateOneOperationAst<typeof schema> => ({
			input: { groups: [[{ label: 'first' }], [{ label }]] },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		})

		await stages.evaluate({ context, operation: create('second') })

		expect(trace).toStrictEqual(['groups', 'label:first', 'label:second'])
		trace.length = 0
		await expect(
			stages.evaluate({ context, operation: create('forbidden') }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(trace).toStrictEqual(['groups', 'label:first', 'label:forbidden'])
		await application.dispose()
	})

	it('correlates final nested object values, including removed list entries', async () => {
		const profileValues: [string | null, string | null][] = []
		const groupValues: [string | null, string | null][] = []
		const schema = Schema.define({
			className: 'NestedFieldUpdateAccess',
			fields: {
				groups: objectField({
					fields: {
						label: stringField({
							access: {
								write: {
									create: true,
									update: {
										clear: ({ originalValue }) => {
											groupValues.push([originalValue, null])

											return true
										},
										fill: true,
										replace: ({ originalValue, value }) => {
											groupValues.push([originalValue, value])

											return true
										},
									},
								},
							},
						}),
					},
					list: true,
				}),
				profile: objectField({
					fields: {
						label: stringField({
							access: {
								write: {
									create: true,
									update: {
										clear: true,
										fill: true,
										replace: ({ originalValue, value }) => {
											profileValues.push([originalValue, value])

											return true
										},
									},
								},
							},
						}),
					},
				}),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: {
				kind: 'update-expression',
				operations: [
					{
						field: 'groups',
						kind: 'set',
						value: [{ label: 'Current first' }],
					},
					{
						field: 'profile',
						kind: 'set',
						value: { label: 'Current profile' },
					},
				],
			},
		} satisfies UpdateOneOperationAst<typeof schema>
		const target = {
			createdAt: '2026-08-03T00:00:00.000Z',
			groups: [{ label: 'Original first' }, { label: 'Removed second' }],
			id: '0198a43e-2431-7000-8000-000000000030',
			profile: { label: 'Original profile' },
			updatedAt: '2026-08-03T00:00:00.000Z',
		} as const

		await stages.evaluate({ context, operation })
		await stages.enforcePreparedMutation?.({ context, operation, target })

		expect(profileValues).toStrictEqual([
			['Original profile', 'Current profile'],
		])
		expect(groupValues).toStrictEqual([
			['Original first', 'Current first'],
			['Removed second', null],
		])
		await application.dispose()
	})

	it('evaluates nested field update Access for every prepared bulk target', async () => {
		const values: [string, string][] = []
		const schema = Schema.define({
			className: 'NestedFieldBulkAccess',
			fields: {
				profile: objectField({
					fields: {
						label: stringField({
							access: {
								write: {
									create: true,
									update: {
										clear: true,
										fill: true,
										replace: ({ originalValue, value }) => {
											values.push([originalValue, value])

											return originalValue !== 'Denied'
										},
									},
								},
							},
						}),
					},
				}),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'update-many',
			query: new QueryBuilder(schema).ast,
			update: {
				kind: 'update-expression',
				operations: [
					{
						field: 'profile',
						kind: 'set',
						value: { label: 'Updated' },
					},
				],
			},
		} satisfies UpdateManyOperationAst<typeof schema>

		await stages.evaluate({ context, operation })
		expect(stages.requiresPreparedMutationItems?.(operation)).toBe(true)
		await expect(
			stages.enforcePreparedMutation?.({
				context,
				operation,
				target: undefined,
				targets: [
					{
						createdAt: '2026-08-03T00:00:00.000Z',
						id: '0198a43e-2431-7000-8000-000000000031',
						profile: { label: 'Allowed' },
						updatedAt: '2026-08-03T00:00:00.000Z',
					},
					{
						createdAt: '2026-08-03T00:00:00.000Z',
						id: '0198a43e-2431-7000-8000-000000000032',
						profile: { label: 'Denied' },
						updatedAt: '2026-08-03T00:00:00.000Z',
					},
				],
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(values).toStrictEqual([
			['Allowed', 'Updated'],
			['Denied', 'Updated'],
		])
		await application.dispose()
	})

	it('uses the materialized upsert branch and final values for Access', async () => {
		const fieldValues: [number | null, number | null][] = []
		const itemModes: string[] = []
		const schema = Schema.define({
			className: 'UpsertOutcomeAccess',
			access: {
				upsert: {
					item: (input) => {
						itemModes.push(input.mode)

						if (input.mode === 'create') {
							expect(input.originalItem).toBeNull()
							expect(input.item.get('title')).toBe('Created')
						} else {
							expect(input.originalItem.get('title')).toBe('Original')
							expect(input.item.title).toBe('Updated')
							expect(input.item.visits).toBe(15)
						}

						return true
					},
				},
			},
			fields: {
				title: stringField({ validation: { required: true } }),
				visits: intField({
					access: {
						write: {
							create: true,
							update: {
								clear: true,
								fill: true,
								replace: ({ originalValue, value }) => {
									fieldValues.push([originalValue, value])

									return true
								},
							},
						},
					},
				}),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const id = '0198a43e-2431-7000-8000-000000000040'
		const operation = {
			create: { title: 'Created', visits: 1 },
			kind: 'upsert-one',
			query: new QueryBuilder(schema).where((where) => where.eq('id', id)).ast,
			target: { fields: ['id'], kind: 'unique-upsert-target' },
			update: {
				kind: 'update-expression',
				operations: [
					{ field: 'title', kind: 'set', value: 'Updated' },
					{ field: 'visits', kind: 'increment', value: 5 },
				],
			},
		} satisfies UpsertOneOperationAst<typeof schema>
		const previous = {
			createdAt: '2026-08-03T00:00:00.000Z',
			id,
			title: 'Original',
			updatedAt: '2026-08-03T00:00:00.000Z',
			visits: 10,
		} as const
		const updated = { ...previous, title: 'Updated', visits: 15 } as const
		const created = {
			...previous,
			title: 'Created',
			visits: 1,
		} as const

		await stages.enforceMutationOutcome?.({
			context,
			operation,
			outcome: {
				materializations: [{ current: updated, kind: 'update', previous }],
				result: updated,
			},
		})
		await stages.enforceMutationOutcome?.({
			context,
			operation,
			outcome: {
				materializations: [{ current: created, kind: 'create' }],
				result: created,
			},
		})

		expect(fieldValues).toStrictEqual([[10, 15]])
		expect(itemModes).toStrictEqual(['update', 'create'])
		await application.dispose()
	})

	it('keeps upsert-many field Access scoped to each matching item', async () => {
		const firstValues: [number | null, number | null][] = []
		const secondValues: [number | null, number | null][] = []
		const schema = Schema.define({
			className: 'BulkUpsertFieldAccess',
			fields: {
				first: intField({
					access: {
						write: {
							create: true,
							update: {
								clear: true,
								fill: true,
								replace: ({ originalValue, value }) => {
									firstValues.push([originalValue, value])

									return true
								},
							},
						},
					},
				}),
				second: intField({
					access: {
						write: {
							create: true,
							update: {
								clear: true,
								fill: true,
								replace: ({ originalValue, value }) => {
									secondValues.push([originalValue, value])

									return true
								},
							},
						},
					},
				}),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const firstId = '0198a43e-2431-7000-8000-000000000050'
		const secondId = '0198a43e-2431-7000-8000-000000000051'
		const operation = {
			items: [
				{
					create: { first: 1 },
					query: new QueryBuilder(schema).where((where) =>
						where.eq('id', firstId),
					).ast,
					target: { fields: ['id'], kind: 'unique-upsert-target' },
					update: {
						kind: 'update-expression',
						operations: [{ field: 'first', kind: 'increment', value: 1 }],
					},
				},
				{
					create: { second: 1 },
					query: new QueryBuilder(schema).where((where) =>
						where.eq('id', secondId),
					).ast,
					target: { fields: ['id'], kind: 'unique-upsert-target' },
					update: {
						kind: 'update-expression',
						operations: [{ field: 'second', kind: 'increment', value: 1 }],
					},
				},
			],
			kind: 'upsert-many',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(schema).ast.schema,
		} satisfies UpsertManyOperationAst<typeof schema>
		const firstPrevious = {
			createdAt: '2026-08-03T00:00:00.000Z',
			first: 10,
			id: firstId,
			second: null,
			updatedAt: '2026-08-03T00:00:00.000Z',
		} as const
		const secondPrevious = {
			createdAt: '2026-08-03T00:00:00.000Z',
			first: null,
			id: secondId,
			second: 20,
			updatedAt: '2026-08-03T00:00:00.000Z',
		} as const
		const firstCurrent = { ...firstPrevious, first: 11 } as const
		const secondCurrent = { ...secondPrevious, second: 21 } as const

		await stages.enforceMutationOutcome?.({
			context,
			operation,
			outcome: {
				materializations: [
					{ current: firstCurrent, kind: 'update', previous: firstPrevious },
					{ current: secondCurrent, kind: 'update', previous: secondPrevious },
				],
				result: [firstCurrent, secondCurrent],
			},
		})

		expect(firstValues).toStrictEqual([[10, 11]])
		expect(secondValues).toStrictEqual([[20, 21]])
		await application.dispose()
	})

	it('projects denied nested read values without changing list cardinality', async () => {
		const trace: string[] = []
		let blockedChildRuns = 0
		const protectedFields = {
			name: stringField(),
			secret: stringField({
				access: {
					read: {
						orderBy: true,
						output: ({ value }) => {
							trace.push(`secret:${String(value)}`)

							return value !== 'hidden'
						},
						where: true,
					},
				},
			}),
		} as const
		const schema = Schema.define({
			className: 'NestedFieldReadAccess',
			fields: {
				blocked: objectField({
					access: { read: false },
					fields: {
						secret: stringField({
							access: {
								read: {
									orderBy: true,
									output: () => {
										blockedChildRuns += 1

										return true
									},
									where: true,
								},
							},
						}),
					},
				}),
				groups: objectField({
					access: {
						read: {
							orderBy: true,
							output: () => {
								trace.push('groups')

								return true
							},
							where: true,
						},
					},
					fields: protectedFields,
					list: [true, true],
				}),
				profile: objectField({ fields: protectedFields }),
			},
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(schema).ast,
		} satisfies FindManyOperationAst<typeof schema>
		const enforcement = await stages.evaluate({ context, operation })
		const result = await stages.enforceSelectionResult({
			context,
			enforcement,
			operation,
			result: [
				{
					blocked: { secret: 'unreachable' },
					createdAt: '2026-08-03T00:00:00.000Z',
					groups: [
						[
							{ name: 'first', secret: 'visible' },
							{ name: 'second', secret: 'hidden' },
						],
						[{ name: 'third', secret: 'hidden' }],
					],
					id: '0198a43e-2431-7000-8000-000000000060',
					profile: { name: 'profile', secret: 'hidden' },
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			],
		})

		expect(result).toStrictEqual([
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				groups: [
					[{ name: 'first', secret: 'visible' }, { name: 'second' }],
					[{ name: 'third' }],
				],
				id: '0198a43e-2431-7000-8000-000000000060',
				profile: { name: 'profile' },
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
		])
		expect(trace).toStrictEqual([
			'groups',
			'secret:visible',
			'secret:hidden',
			'secret:hidden',
			'secret:hidden',
		])
		expect(blockedChildRuns).toBe(0)
		await application.dispose()
	})

	it('checks singular prepared targets and removes value-dependent output fields', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: UpdateOneOperationAst<typeof articleSchema> = {
			kind: 'update-one',
			query: new QueryBuilder(articleSchema).ast,
			update: {
				kind: 'update-expression',
				operations: [{ field: 'title', kind: 'set', value: 'Changed' }],
			},
		}

		await expect(
			stages.enforcePreparedMutation?.({
				context,
				operation,
				target: {
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000001',
					published: false,
					secret: 'hidden',
					title: 'Draft',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const find = createFind()
		const enforcement = await stages.evaluate({ context, operation: find })
		const result = await stages.enforceSelectionResult({
			context,
			enforcement,
			operation: find,
			result: [
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000010',
					published: true,
					secret: 'hidden',
					title: 'Private',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000011',
					published: true,
					secret: 'visible',
					title: 'Public',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			],
		})

		expect(result).toStrictEqual([
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000010',
				published: true,
				title: 'Private',
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000011',
				published: true,
				secret: 'visible',
				title: 'Public',
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
		])
		const finalResult = await stages.enforceResult({
			context,
			enforcement,
			operation: find,
			result: [
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000012',
					published: true,
					secret: 'hidden',
					title: 'Restored',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			],
		})
		expect(finalResult).toStrictEqual([
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000012',
				published: true,
				title: 'Restored',
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
		])
		await application.dispose()
	})

	it('runs asynchronous decisions sequentially through the shared executor', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'SequentialAccess',
			access: {
				read: () => {
					trace.push('developer')
					return Promise.resolve(true)
				},
			},
			fields: { title: stringField() },
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: FindManyOperationAst<typeof schema> = {
			kind: 'find-many',
			query: new QueryBuilder(schema).ast,
		}

		await stages.evaluate({ context, operation })
		expect(trace).toStrictEqual(['developer'])
		expect(vi.isMockFunction(trace.push)).toBe(false)
		await application.dispose()
	})

	it('honors contribution-owned master bypass without weakening enforced rules', async () => {
		const schema = Schema.define({
			className: 'MasterAccess',
			fields: { title: stringField() },
		})
		const bypass = definePlugin({
			name: 'fixture.master-bypass',
			setup: ({ access }) => {
				access.schema(
					'deny-anonymous',
					schema,
					{ read: false },
					{ master: 'bypass' },
				)
			},
		})
		const application = await createApplication({
			access: { default: false },
			plugins: [bypass],
			schemas: [schema],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: FindManyOperationAst<typeof schema> = {
			kind: 'find-many',
			query: new QueryBuilder(schema).ast,
		}
		const master = createTrustedMasterRequestContext(
			'fixture audit',
			'fixture-key',
			context,
		)

		await expect(stages.evaluate({ context, operation })).rejects.toMatchObject(
			{
				code: 'PERMISSION_DENIED',
			},
		)
		await expect(
			stages.evaluate({ context: master, operation }),
		).resolves.toBeDefined()
		await application.dispose()
	})

	it('cancels Access callbacks before later rules or business work can run', async () => {
		const controller = new AbortController()
		controller.abort('fixture cancelled')
		const cancelled = RequestContext.anonymous({
			requestId: 'cancelled-access',
			signal: controller.signal,
			source: requestSources.internal,
		})
		const schema = Schema.define({
			className: 'CancelledAccess',
			access: { read: () => true },
			fields: { title: stringField() },
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: FindManyOperationAst<typeof schema> = {
			kind: 'find-many',
			query: new QueryBuilder(schema).ast,
		}

		await expect(
			stages.evaluate({ context: cancelled, operation }),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		await application.dispose()
	})
})
