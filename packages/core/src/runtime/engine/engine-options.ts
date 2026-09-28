import { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import { isPlainRecord } from '@ultimabase/shared'
import type { SchemaDefinition } from '../../schema/index.js'
import { MasterAuthority } from '../master/master-authority.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

/** Captures every application-owned dependency shared by its request engines. */
export interface FrameworkEngineOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> {
	readonly application: FrameworkApplication<TSchemas, TPlugins>
	readonly masterAuthority?: MasterAuthority
	readonly pipeline: RuntimePipeline
}

/** Rejects malformed low-level construction before it can bind request state. */
export const assertFrameworkEngineOptions = (
	options: FrameworkEngineOptions<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): void => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('Framework engine options must be a plain object')
	}

	if (!(untrustedOptions.application instanceof FrameworkApplication)) {
		throw new TypeError(
			'Framework engine application must be a FrameworkApplication',
		)
	}

	if (!(untrustedOptions.pipeline instanceof RuntimePipeline)) {
		throw new TypeError('Framework engine pipeline must be a RuntimePipeline')
	}

	if (
		untrustedOptions.masterAuthority !== undefined &&
		!(untrustedOptions.masterAuthority instanceof MasterAuthority)
	) {
		throw new TypeError(
			'Framework engine masterAuthority must be a MasterAuthority',
		)
	}
}
