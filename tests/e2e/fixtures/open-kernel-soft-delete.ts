import {
	adapterPersistencePlanCapability,
	booleanField,
	constraint,
	databaseConstraint,
	normalizeUpdateExpression,
	persistencePlanRewriter,
	providePersistencePlanRewriter,
	provideRuntimeConstraint,
	requireCapability,
	rewriteDeletePersistencePlan,
	type PluginDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import { definePluginModule, patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

export const softDeleteVisibilityConstraintKind =
	'fixture.open-kernel.soft-delete-visible' as const

const softDeleteModule = definePluginModule({
	core: '^0.0.0',
	pluginId: 'fixture.open-kernel-soft-delete',
	version: '1.0.0',
})
const persistence = requireCapability(
	adapterPersistencePlanCapability,
	'^1.0.0',
)

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
	const visible = constraint({
		handler: () =>
			databaseConstraint(softDeleteVisibilityConstraintKind, 1, {
				field: 'isDeleted',
			}),
		operations: ['find-one', 'find-many', 'get', 'count', 'exists'],
		schema: options.target,
	})

	return softDeleteModule.plugin({
		capabilities: {
			provides: [
				provideRuntimeConstraint({
					contributionId: 'visible-rows',
					create: () => ({ value: visible }),
				}),
				providePersistencePlanRewriter({
					contributionId: 'logical-delete',
					create: () => ({ value: rewriter }),
				}),
			],
			requires: [persistence],
		},
		declare: ({ schemas }) => {
			schemas.patch(
				patchSchemas({
					patch: schemaPatch().addField({
						contributionId: 'tombstone',
						field: booleanField({ default: false }),
						name: 'isDeleted',
					}),
					targets: schemas.select({ className: options.target.className }),
				}),
			)
		},
		instanceId: options.instanceId,
		privileges: [
			{ name: 'adapter:consume', reason: 'Requires delete-plan support.' },
			{ name: 'schema:declare', reason: 'Adds tombstone metadata.' },
			{ name: 'runtime:constrain', reason: 'Hides tombstones privately.' },
			{ name: 'persistence:rewrite', reason: 'Rewrites logical deletes.' },
		] as const,
	})
}
