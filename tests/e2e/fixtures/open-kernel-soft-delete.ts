import {
	booleanField,
	contributeDeclarations,
	databaseConstraint,
	normalizeUpdateExpression,
	persistencePlanRewriter,
	protectedPolicy,
	providePersistencePlanRewriter,
	provideRuntimeConstraint,
	plugin,
	rewriteDeletePersistencePlan,
	type PluginDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

export const softDeleteVisibilityConstraintKind =
	'fixture.open-kernel.soft-delete-visible' as const

export interface SoftDeletePluginOptions {
	readonly instanceId: string
	readonly target: SchemaDefinition
}

/** Adds monotonic visibility and rewrites physical deletes as tombstones. */
export const createSoftDeletePlugin = (
	options: SoftDeletePluginOptions,
): PluginDefinition => {
	const rewriter = persistencePlanRewriter({
		operations: ['delete-one'],
		rewrite: ({ plan }) =>
			rewriteDeletePersistencePlan(
				plan,
				normalizeUpdateExpression(options.target, { isDeleted: true }),
			),
		schema: options.target,
	})
	const visible = protectedPolicy({
		evaluate: () => ({
			constraints: databaseConstraint(softDeleteVisibilityConstraintKind, 1, {
				field: 'isDeleted',
			}),
		}),
		operations: ['find-one', 'find-many', 'get', 'count', 'exists'],
		schema: options.target,
	})

	return plugin({
		core: '^0.0.0',
		id: 'fixture.open-kernel-soft-delete',
		version: '1.0.0',
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'visible-rows',
				create: () => ({ value: visible }),
			}),
			providePersistencePlanRewriter({
				contributionId: 'logical-delete',
				create: () => ({ value: rewriter }),
			}),
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch(
						patchSchemas({
							patch: schemaPatch().addField({
								contributionId: 'tombstone',
								field: booleanField({ default: false }),
								name: 'isDeleted',
							}),
							targets: schemas.select({
								className: options.target.className,
							}),
						}),
					)
				},
			}),
		],
		instanceId: options.instanceId,
		permissions: {
			'schema:declare': 'Adds tombstone metadata.',
			'runtime:constrain': 'Hides tombstones privately.',
			'persistence:rewrite': 'Rewrites logical deletes.',
		},
	})
}
