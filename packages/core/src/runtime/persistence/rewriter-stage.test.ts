import { describe, expect, it, vi } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import {
	createApplication,
	FrameworkApplication,
} from '../../application/framework-application.js'
import { provideCapability } from '../../plugins/capabilities.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { normalizeUpdateExpression } from '../../query/index.js'

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
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

const articleSchema = UltimaBase.Schema.define({
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
	createPlugin({
		core: '^0.0.0',
		id: pluginId,
		version: '1.0.0',
		...(withPrivilege
			? {
					permissions: {
						'persistence:rewrite':
							'Exercises the protected persistence boundary.',
					},
				}
			: {}),
		contributions: [
			providePersistencePlanRewriter({
				contributionId: 'soft-delete',
				create: () => ({ value: definition }),
			}),
		],
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

	it('derives the persistence privilege and requires the exact facade', () => {
		expect(
			defineRewriterPlugin(
				'fixture.persistence-unprivileged',
				false,
			).manifest.privileges.find(({ name }) => name === 'persistence:rewrite'),
		).toStrictEqual({
			name: 'persistence:rewrite',
			reason: 'Registers persistence plan rewriters.',
		})

		const generic = createPlugin({
			core: '^0.0.0',
			id: 'fixture.persistence-generic',
			version: '1.0.0',
			permissions: { 'persistence:rewrite': 'Exercises exact facades.' },
			contributions: [
				provideCapability(persistencePlanRewriterCapability, {
					contributionId: 'generic',
					create: () => ({ value: definition }),
				}),
			],
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
		const otherSchema = UltimaBase.Schema.define({
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
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.persistence-schema-collection',
			version: '1.0.0',
			permissions: { 'persistence:rewrite': 'Exercises exact targeting.' },
			contributions: [
				providePersistencePlanRewriter({
					contributionId: 'targeted-delete',
					create: () => ({ value: collectionDefinition }),
				}),
			],
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
		const otherSchema = UltimaBase.Schema.define({
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
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.persistence-malformed',
			version: '1.0.0',
			permissions: { 'persistence:rewrite': 'Exercises diagnostics.' },
			contributions: [
				providePersistencePlanRewriter({
					contributionId: 'cross-schema',
					create: () => ({ value: malformed }),
				}),
			],
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
