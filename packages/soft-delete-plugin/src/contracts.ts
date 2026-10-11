import {
	defineOperationValue,
	defineTypegenReference,
	type PluginOperationValueContract,
} from '@ultimabase/core/plugin'

/** Selects the application-wide fallback used when a schema omits `softDelete`. */
export type SoftDeleteMode = 'disabled' | 'explicit' | 'replace-delete'

/** Overrides the plugin fallback for one application-owned schema. */
export type SoftDeleteSchemaOption = false | Exclude<SoftDeleteMode, 'disabled'>

/** Configures one isolated official soft-delete plugin instance. */
export interface SoftDeletePluginOptions {
	/**
	 * Selects the mode inherited by schemas that omit `softDelete`.
	 *
	 * @default "disabled"
	 */
	readonly defaultMode?: SoftDeleteMode
	/** Distinguishes two explicit configurations in one application. */
	readonly instanceId?: string
}

/** @internal Carries the strict immutable factory result into later declarations. */
export interface NormalizedSoftDeletePluginOptions {
	readonly defaultMode: SoftDeleteMode
	readonly instanceId?: string
}

/** @internal Stable identities used to recognize only this plugin's administration. */
export const restoreMutationName = 'ultimabase.soft-delete.restore'
export const purgeMutationName = 'ultimabase.soft-delete.purge'

/**
 * @internal All three mutations reject payloads through the same unit contract,
 * which Typegen renders as Core's payload-free mutation input.
 */
export const softDeleteNoInput: PluginOperationValueContract<undefined> =
	defineOperationValue(
		(value, path): undefined => {
			if (value !== undefined) {
				throw new TypeError(`${path} must be undefined`)
			}
			return undefined
		},
		defineTypegenReference({
			exportName: 'PluginSchemaMutationNoInput',
			module: '@ultimabase/core',
		}),
	)
