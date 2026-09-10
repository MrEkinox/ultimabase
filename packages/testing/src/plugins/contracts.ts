import type { PluginEnvironmentClaim, PluginPrivilege } from '@ultimabase/core'

/** Names every invariant reported independently by the public conformance suite. */
export type PluginConformanceContract =
	| 'adapter-failure'
	| 'application-isolation'
	| 'capability-contracts'
	| 'codec'
	| 'environment-claim-denial'
	| 'instance-identity'
	| 'javascript-operation'
	| 'lifecycle-cleanup'
	| 'manifest'
	| 'middleware'
	| 'migration'
	| 'operation'
	| 'persistence'
	| 'privilege-denial'
	| 'provenance'
	| 'schema-mutation'
	| 'schema-surface'
	| 'static-determinism'
	| 'transport'
	| 'typegen'

/** Names checks supplied by a plugin author in addition to the common kernel suite. */
export type OptionalPluginConformanceContract = Exclude<
	PluginConformanceContract,
	| 'application-isolation'
	| 'capability-contracts'
	| 'environment-claim-denial'
	| 'instance-identity'
	| 'lifecycle-cleanup'
	| 'manifest'
	| 'privilege-denial'
	| 'provenance'
	| 'static-determinism'
>

/** Declares the package facts that the suite must verify independently. */
export interface PluginConformanceExpected<
	TPluginId extends string = string,
	TVersion extends string = string,
	TCoreRange extends string = string,
> {
	/** Stable namespaced identity expected from every fixture. */
	readonly pluginId: TPluginId
	/** Canonical package version expected in provenance. */
	readonly version: TVersion
	/** Supported Core range expected in the manifest. */
	readonly core: TCoreRange
	/** Optionally protects the exact requested privilege order. */
	readonly privileges?: readonly PluginPrivilege[]
	/** Optionally protects the exact environmental claim order. */
	readonly environment?: readonly PluginEnvironmentClaim[]
}

/** Reports one successfully completed invariant. */
export interface PluginConformanceCheckResult {
	readonly contract: PluginConformanceContract
	readonly status: 'passed'
}

/** Summarizes one complete successful run without retaining applications or resources. */
export interface PluginConformanceReport {
	readonly checks: readonly PluginConformanceCheckResult[]
	readonly pluginId: string
}

/** Identifies the exact conformance contract that rejected a plugin fixture. */
export class PluginConformanceError extends Error {
	readonly contract: PluginConformanceContract
	readonly pluginId: string

	constructor(
		contract: PluginConformanceContract,
		pluginId: string,
		cause: unknown,
	) {
		super(`Plugin "${pluginId}" failed conformance contract "${contract}".`, {
			cause,
		})
		this.name = 'PluginConformanceError'
		this.contract = contract
		this.pluginId = pluginId
	}
}
