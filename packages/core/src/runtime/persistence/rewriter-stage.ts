import { FrameworkError } from '../../errors/framework-error.js'
import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { formatPluginIdentity } from '../../plugins/manifest.js'
import {
	getPersistencePlanRewriteHandler,
	persistencePlanRewriterCapability,
} from './capabilities.js'
import type { RuntimePersistencePlanRewriteStage } from './contracts.js'
import { acceptDatabasePersistenceRewrite } from './plans.js'

/** Compiles materialized rewriters without creating an absent placeholder stage. */
export const createPersistencePlanRewriteStage = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): RuntimePersistencePlanRewriteStage | undefined => {
	const contributions = readApplicationCapabilityContributions(
		application,
		persistencePlanRewriterCapability,
	).map((contribution) => {
		const handler = getPersistencePlanRewriteHandler(contribution.value)

		if (handler === undefined) {
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_CONFLICT',
				`Plugin "${formatPluginIdentity(contribution.owner)}" materialized an invalid persistence plan rewriter.`,
				{
					internalDetails: {
						kind: 'persistence-plan-rewriter-invalid',
						plugin: formatPluginIdentity(contribution.owner),
						contributionId: contribution.contributionId,
					},
				},
			)
		}

		return { ...contribution, handler }
	})

	if (contributions.length === 0) return undefined

	return async (input) => {
		let plan = input.plan

		for (const contribution of contributions) {
			const definition = contribution.value
			const targetSchema = plan.target.schema.definition
			if (
				!definition.operations.includes(input.logicalOperation.kind) ||
				(definition.schema !== undefined &&
					definition.schema !== targetSchema) ||
				(definition.schemas !== undefined &&
					!definition.schemas.includes(targetSchema))
			) {
				continue
			}

			try {
				const candidate: unknown = await runWithApplicationPluginOwner(
					application,
					contribution.owner,
					() =>
						contribution.handler({
							logicalOperation: input.logicalOperation,
							plan,
						}),
				)
				plan = acceptDatabasePersistenceRewrite(
					input.logicalOperation,
					plan,
					candidate,
					contribution,
				)
			} catch (error: unknown) {
				throw new FrameworkError(
					'INTERNAL_ERROR',
					`Persistence plan rewriter "${contribution.contributionId}" from plugin "${formatPluginIdentity(contribution.owner)}" failed.`,
					{
						cause: error,
						publicMessage: 'The database operation could not be prepared.',
						internalDetails: {
							kind: 'persistence-plan-rewrite-failed',
							plugin: formatPluginIdentity(contribution.owner),
							contributionId: contribution.contributionId,
						},
					},
				)
			}
		}

		return plan
	}
}
