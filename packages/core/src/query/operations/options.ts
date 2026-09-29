import type { PluginDefinition } from '../../foundation.js'
import type { UltimaBase } from '../../runtime/application/ultima-base.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type { RequestContext } from '../../runtime/context/request-context.js'
import type { SchemaDefinition } from '../../schema/index.js'

/** Identifies any concrete UltimaBase facade without exposing its plugin tuple. */
type OperationUltimaBase = UltimaBase<
	readonly SchemaDefinition[],
	readonly PluginDefinition[],
	PluginSourceState
>

/**
 * Selects inherited, plugin-derived, or audited-master operation execution.
 * Omitting `context` and `useMasterKey` inherits the active request.
 *
 * @example `await Post.findMany()`
 * @example `await Post.createOne({ data }, { useMasterKey: true })`
 */
export interface OperationOptions {
	/**
	 * Selects an immutable plugin-derived context without accepting credentials.
	 * Combine it with `useMasterKey: true` to elevate that exact context.
	 *
	 * @example `await Post.findMany(undefined, { context, ultimabase })`
	 */
	readonly context?: RequestContext
	/**
	 * Temporarily selects one exact application during migration. Ordinary calls
	 * resolve the sole initialized active application and should omit this field.
	 *
	 * @deprecated Direct class and model commands resolve their sole active owner.
	 */
	readonly ultimabase?: OperationUltimaBase
	/**
	 * Requests audited master authority from trusted backend code only.
	 * Transport input and serialized operation data must never supply this option.
	 *
	 * @example `await Post.findMany(undefined, { useMasterKey: true })`
	 * @example `await Post.createOne({ data }, { useMasterKey: true })`
	 * Plugin-owned callbacks initiating this elevation require their exact active
	 * `authority:elevate` privilege; inherited Master execution does not.
	 */
	readonly useMasterKey?: true
}
