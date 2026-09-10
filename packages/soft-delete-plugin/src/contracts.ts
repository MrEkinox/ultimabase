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
