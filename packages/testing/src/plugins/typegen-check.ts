import type { PluginDefinition, SchemaDefinition } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import {
	generateApplicationTypes,
	type GeneratedApplicationTypes,
} from '@ultimabase/typegen'

import { PluginConformanceSuite } from './suite.js'

/** Configures the optional deterministic generic Typegen check. */
export interface PluginTypegenConformanceOptions {
	/** Stable fixture-local application identity used for both generations. */
	readonly applicationId?: string
	/** Performs plugin-specific assertions on the generated public contract. */
	readonly verify?: (
		generated: GeneratedApplicationTypes,
	) => Promise<void> | void
}

/**
 * Adds deterministic generic Typegen generation without running plugin setup.
 *
 * @example
 * ```ts
 * const typedSuite = withPluginTypegenConformance(suite, {
 *   verify: ({ contents }) => {
 *     if (!contents.includes('WorkflowState')) throw new Error('missing type')
 *   },
 * })
 * ```
 */
export const withPluginTypegenConformance = <
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
>(
	suite: PluginConformanceSuite<TSubject, TSupport, TSchemas>,
	options: PluginTypegenConformanceOptions = {},
): PluginConformanceSuite<TSubject, TSupport, TSchemas> => {
	if (!(suite instanceof PluginConformanceSuite)) {
		throw new TypeError(
			'Typegen conformance requires a plugin conformance suite',
		)
	}
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('Typegen conformance options must be a plain object')
	}
	const applicationId = options.applicationId ?? 'plugin-conformance'
	if (applicationId.trim() === '') {
		throw new TypeError('Typegen conformance applicationId must be non-empty')
	}
	if (options.verify !== undefined && typeof options.verify !== 'function') {
		throw new TypeError('Typegen conformance verify must be a function')
	}
	const normalized = immutableRecord({
		applicationId,
		...(options.verify === undefined ? {} : { verify: options.verify }),
	})

	return suite.check('typegen', async (context) => {
		const first = context.createUltimaBase()
		const second = context.createUltimaBase()
		const firstGenerated = generateApplicationTypes({
			ultimabase: first.ultimabase,
			applicationId: normalized.applicationId,
		})
		const secondGenerated = generateApplicationTypes({
			ultimabase: second.ultimabase,
			applicationId: normalized.applicationId,
		})

		if (
			firstGenerated.fingerprint !== secondGenerated.fingerprint ||
			firstGenerated.contents !== secondGenerated.contents
		) {
			throw new TypeError('generic Typegen output is not deterministic')
		}
		await normalized.verify?.(firstGenerated)
	})
}
