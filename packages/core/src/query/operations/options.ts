import type { RequestContext } from '../../runtime/context/request-context.js'

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
	 * @example `await Post.findMany(undefined, { context })`
	 */
	readonly context?: RequestContext
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
