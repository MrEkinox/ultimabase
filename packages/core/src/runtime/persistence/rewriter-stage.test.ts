import { describe, expect, it, vi } from 'vitest'

import {
	FrameworkApplication,
	FrameworkError,
	createApplication,
} from '../../foundation.js'
import { provideCapability } from '../../plugins/capabilities.js'
import { definePlugin } from '../../plugins/definition.js'
import { QueryBuilder, normalizeUpdateExpression } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import {
	persistencePlanRewriter,
	persistencePlanRewriterCapability,
	providePersistencePlanRewriter,
} from './capabilities.js'
import {
	createDatabasePersistencePlan,
	rewriteDeletePersistencePlan,
} from './plans.js'
import type { DatabasePersistenceRewriteInput } from './contracts.js'
import { createPersistencePlanRewriteStage } from './rewriter-stage.js'

const articleSchema = Schema.define({
	className: 'PersistenceStageArticle',
	fields: (field) => ({ deleted: field.boolean() }),
})
const deleteOperation = {
	kind: 'delete-one',
	query: new QueryBuilder(articleSchema).where((where) =>
		where.eq('id', 'article-1'),
	).ast,
} as const
const definition = persistencePlanRewriter({
	operations: ['delete-one'],
	schema: articleSchema,
	rewrite: ({ plan }) =>
		rewriteDeletePersistencePlan(
			plan,
			normalizeUpdateExpression(articleSchema, { deleted: true }),
		),
})

const captureFrameworkError = (run: () => unknown): unknown => {
	try {
		run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError) return error
		throw error
	}

	throw new TypeError('Expected a FrameworkError')
}

const defineRewriterPlugin = (pluginId: string, withPrivilege = true) =>
	definePlugin({
		core: '^0.0.0',
		pluginId,
		version: '1.0.0',
		...(withPrivilege
			? {
					privileges: [
						{
							name: 'persistence:rewrite' as const,
							reason: 'Exercises the protected persistence boundary.',
						},
					],
				}
			: {}),
		capabilities: {
			provides: [
				providePersistencePlanRewriter({
					contributionId: 'soft-delete',
					create: () => ({ value: definition }),
				}),
			],
		},
	})

describe('persistence plan rewriter capability', () => {
	it('rejects ambiguous singular and collection schema targeting', () => {
		const identityRewrite = (input: DatabasePersistenceRewriteInput) =>
			input.plan
		expect(() =>
			persistencePlanRewriter({
				operations: ['delete-one'],
				rewrite: identityRewrite,
				schema: articleSchema,
				schemas: [articleSchema],
			} as never),
		).toThrow(
			'Persistence plan rewriters cannot target both schema and schemas',
		)
	})

	it('requires the exact facade and persistence privilege', () => {
		const privilegeFailure = captureFrameworkError(
			() =>
				new FrameworkApplication({
					plugins: [
						defineRewriterPlugin('fixture.persistence-unprivileged', false),
					],
					schemas: [articleSchema],
				}),
		)
		expect(privilegeFailure).toMatchObject({
			code: 'PLUGIN_CAPABILITY_CONFLICT',
			internalDetails: { privilege: 'persistence:rewrite' },
		})

		const generic = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.persistence-generic',
			version: '1.0.0',
			privileges: [
				{ name: 'persistence:rewrite', reason: 'Exercises exact facades.' },
			],
			capabilities: {
				provides: [
					provideCapability(persistencePlanRewriterCapability, {
						contributionId: 'generic',
						create: () => ({ value: definition }),
					}),
				],
			},
		})

		const facadeFailure = captureFrameworkError(
			() =>
				new FrameworkApplication({
					plugins: [generic],
					schemas: [articleSchema],
				}),
		)
		expect(facadeFailure).toMatchObject({
			internalDetails: {
				kind: 'persistence-rewriter-provider-factory',
			},
		})
	})

	it('materializes one optional stage and retains owner diagnostics', async () => {
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [defineRewriterPlugin('fixture.persistence-authorized')],
			schemas: [articleSchema],
		})

		try {
			const stage = createPersistencePlanRewriteStage(application)
			const canonical = createDatabasePersistencePlan(deleteOperation)

			expect(stage).toBeTypeOf('function')
			const rewritten = await stage?.({
				logicalOperation: deleteOperation,
				plan: canonical,
			})
			expect(rewritten).toMatchObject({
				kind: 'update-one',
				returning: { operationKind: 'delete-one' },
				provenance: [
					{ contributionId: 'canonical-persistence-plan' },
					{
						contributionId: 'soft-delete',
						owner: { pluginId: 'fixture.persistence-authorized' },
					},
				],
			})
		} finally {
			await application.dispose()
		}
	})

	it('targets an immutable application schema collection without touching other plans', async () => {
		const otherSchema = Schema.define({
			className: 'PersistenceStageUntargeted',
			fields: (field) => ({ deleted: field.boolean() }),
		})
		const rewriteCalls = vi.fn()
		const collectionDefinition = persistencePlanRewriter({
			operations: ['delete-one'],
			rewrite: ({ plan }) => {
				rewriteCalls()
				return rewriteDeletePersistencePlan(
					plan,
					normalizeUpdateExpression(articleSchema, { deleted: true }),
				)
			},
			schemas: [articleSchema],
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.persistence-schema-collection',
			version: '1.0.0',
			privileges: [
				{ name: 'persistence:rewrite', reason: 'Exercises exact targeting.' },
			],
			capabilities: {
				provides: [
					providePersistencePlanRewriter({
						contributionId: 'targeted-delete',
						create: () => ({ value: collectionDefinition }),
					}),
				],
			},
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [articleSchema, otherSchema],
		})

		try {
			const stage = createPersistencePlanRewriteStage(application)
			const otherDelete = {
				kind: 'delete-one',
				query: new QueryBuilder(otherSchema).where((where) =>
					where.eq('id', 'other-1'),
				).ast,
			} as const
			const untouched = createDatabasePersistencePlan(otherDelete)

			expect(
				await stage?.({ logicalOperation: otherDelete, plan: untouched }),
			).toBe(untouched)
			expect(rewriteCalls).not.toHaveBeenCalled()

			const targeted = createDatabasePersistencePlan(deleteOperation)
			expect(
				await stage?.({ logicalOperation: deleteOperation, plan: targeted }),
			).toMatchObject({ kind: 'update-one' })
			expect(rewriteCalls).toHaveBeenCalledOnce()
		} finally {
			await application.dispose()
		}
	})

	it('wraps a malformed cross-schema result with contribution ownership', async () => {
		const otherSchema = Schema.define({
			className: 'PersistenceStageOther',
			fields: (field) => ({ deleted: field.boolean() }),
		})
		const malformed = persistencePlanRewriter({
			operations: ['delete-one'],
			rewrite: ({ plan }) =>
				({
					...plan,
					target: { schema: new QueryBuilder(otherSchema).ast.schema },
				}) as never,
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.persistence-malformed',
			version: '1.0.0',
			privileges: [
				{ name: 'persistence:rewrite', reason: 'Exercises diagnostics.' },
			],
			capabilities: {
				provides: [
					providePersistencePlanRewriter({
						contributionId: 'cross-schema',
						create: () => ({ value: malformed }),
					}),
				],
			},
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [articleSchema, otherSchema],
		})

		try {
			const stage = createPersistencePlanRewriteStage(application)
			const failure: unknown = await Promise.resolve(
				stage?.({
					logicalOperation: deleteOperation,
					plan: createDatabasePersistencePlan(deleteOperation),
				}),
			).catch((error: unknown) => error)

			expect(failure).toBeInstanceOf(FrameworkError)
			expect(failure).toMatchObject({
				code: 'INTERNAL_ERROR',
				internalDetails: {
					contributionId: 'cross-schema',
					plugin: 'fixture.persistence-malformed',
				},
			})
		} finally {
			await application.dispose()
		}
	})
})
