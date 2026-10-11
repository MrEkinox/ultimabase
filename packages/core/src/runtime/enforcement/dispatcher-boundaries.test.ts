import { plugin as createPlugin } from '../../plugins/plugin.js'
import { createApplication } from '../../application/framework-application.js'
import { type ExecutableOperationAst } from '../../query/index.js'
import { describe, expect, it, vi } from 'vitest'
import { createTestRuntimeConstraints } from '../../../tests/runtime/fixtures/runtime-capabilities.js'
import {
	articleSchema,
	context,
	createOperation,
	foreignSchema,
	requireEnforcementStages,
	runtimeConstrainPrivileges,
} from '../../../tests/fixtures/enforcement-dispatcher.js'
import { guard } from './definitions.js'
import { protectedPolicy } from './protected-policy.js'
import { createEnforcementStages } from './dispatcher.js'
import { QueryBuilder } from '../../plugin.js'

describe('createEnforcementStages mutation boundaries', () => {
	it('rejects excluded input across every create, update, and upsert shape', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.all-mutation-inputs',
			permissions: {
				[runtimeConstrainPrivileges[0].name]:
					runtimeConstrainPrivileges[0].reason,
			},
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.title-only',
					protectedPolicy({
						schema: articleSchema,
						evaluate: () => ({ inputFields: ['title'] }),
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
		const query = new QueryBuilder(articleSchema).ast
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
			{
				input: blockedInput,
				kind: 'create-one',
				selection: { fields: [], kind: 'selection' },
				schema,
			},
			{
				inputs: [blockedInput],
				kind: 'create-many',
				selection: query.selection,
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
				selection: query.selection,
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
			'removed constraints effect',
			protectedPolicy({
				evaluate: (() => ({
					constraints: {
						kind: 'fixture.forged',
						version: 1,
						payload: null,
					},
				})) as never,
			}),
			'protected policy effects contain unknown key: constraints',
		],
		[
			'non-array field restriction',
			protectedPolicy({
				evaluate: (() => ({ selectionFields: 'title' })) as never,
			}),
			'protected policy selectionFields must be an array',
		],
		[
			'unknown field',
			protectedPolicy({
				evaluate: () => ({ selectionFields: ['missing'] }),
			}),
			'returned an unknown schema field',
		],
	] as const)(
		'rejects invalid %s from JavaScript plugins',
		async (_label, definition, message) => {
			const plugin = createPlugin({
				version: '0.0.0',
				core: '^0.0.0',
				id: 'fixture.invalid-enforcement',
				permissions: {
					[runtimeConstrainPrivileges[0].name]:
						runtimeConstrainPrivileges[0].reason,
				},
				contributions: createTestRuntimeConstraints((provide) => {
					provide('fixture.invalid', definition)
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
			).rejects.toThrow(message)

			await application.dispose()
		},
	)

	it('rejects foreign schema scopes during application assembly', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.foreign-enforcement',
			permissions: {
				[runtimeConstrainPrivileges[0].name]:
					runtimeConstrainPrivileges[0].reason,
			},
			contributions: createTestRuntimeConstraints((provide) => {
				provide(
					'fixture.foreign',
					guard({ schema: foreignSchema, handler: vi.fn() }),
				)
			}),
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
