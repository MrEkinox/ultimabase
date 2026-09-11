import { immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import type { SchemaContributionProvenance } from '../../schema/index.js'
import type { RuntimeCallbackDescriptor } from './execution.js'

/** Maps compiled schema provenance to the exact owner of one Runtime callback. */
export const createSchemaRuntimeCallbackOwner = (
	provenance: SchemaContributionProvenance,
): RuntimeCallbackDescriptor['owner'] => {
	if (provenance.owner.kind === 'application') {
		return immutableRecord({
			contributionId: provenance.contributionId,
			kind: 'application' as const,
		})
	}
	if (provenance.owner.kind === 'plugin') {
		return immutableRecord({
			contributionId: provenance.contributionId,
			kind: 'plugin' as const,
			pluginId: provenance.owner.pluginId,
			...(provenance.owner.instanceId === undefined
				? {}
				: { instanceId: provenance.owner.instanceId }),
		})
	}

	throw new FrameworkError(
		'INTERNAL_ERROR',
		'Core-owned schema fields cannot carry application Runtime callbacks.',
		{ publicMessage: 'The operation could not be completed.' },
	)
}
