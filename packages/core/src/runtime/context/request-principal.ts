import { requestPrincipalResolverCapability } from '../../access/index.js'
import type { Principal } from '../../access/subject/principal.js'
import { readApplicationRuntimeKernelState } from '../../application/application-kernel-state.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { Pointer, type PointerValue } from '../../schema/relations/pointer.js'
import { getActiveRequestEngine } from './active-framework-context.js'
import {
	getRequestContextOwner,
	type RequestContext,
} from './request-context.js'

/**
 * Holds the principal of one request identity (ADR-0304). Contexts that keep
 * the same values (Master elevation) share one cell, so the principal is
 * resolved at most once and survives `useMasterKey`.
 */
interface RequestPrincipalCell {
	readonly explicit: boolean
	readonly value?: unknown
	resolution?: Promise<PointerValue | undefined>
}

const requestPrincipalCells = new WeakMap<object, RequestPrincipalCell>()

const readCell = (context: object): RequestPrincipalCell => {
	let cell = requestPrincipalCells.get(context)
	if (cell === undefined) {
		cell = { explicit: false }
		requestPrincipalCells.set(context, cell)
	}
	return cell
}

/** @internal Shares the principal of a context with one derived context. */
export const shareRequestPrincipal = (source: object, target: object): void => {
	requestPrincipalCells.set(target, readCell(source))
}

/** @internal Keeps an explicit principal when a context gains another value. */
export const inheritExplicitRequestPrincipal = (
	source: object,
	target: object,
): void => {
	const cell = requestPrincipalCells.get(source)
	if (cell?.explicit === true) requestPrincipalCells.set(target, cell)
}

/** @internal Names the principal of one context instead of its provider's answer. */
export const setExplicitRequestPrincipal = (
	context: object,
	principal: unknown,
): void => {
	requestPrincipalCells.set(context, { explicit: true, value: principal })
}

const ownsSchema = (application: object, schema: unknown): boolean =>
	application instanceof FrameworkApplication && application.ownsSchema(schema)

const validatePrincipal = (
	application: object,
	principal: unknown,
): PointerValue | undefined => {
	if (principal === undefined) return undefined
	if (!Pointer.is(principal)) {
		throw new TypeError('Request principal must be a Core Pointer')
	}
	if (!ownsSchema(application, principal.schema)) {
		throw new TypeError(
			'Request principal belongs to a foreign application schema',
		)
	}
	return principal
}

const resolveCell = async (
	context: RequestContext,
	application: object,
	cell: RequestPrincipalCell,
): Promise<PointerValue | undefined> => {
	if (cell.explicit) return validatePrincipal(application, cell.value)
	const state = readApplicationRuntimeKernelState(application)
	if (!state.bound) return undefined
	// The capability is `single`: a second provider already failed at startup.
	const provider = state.capabilityContributions(
		requestPrincipalResolverCapability,
	)[0]
	if (provider === undefined) return undefined
	const principal: unknown = await runWithApplicationPluginOwner(
		application,
		provider.owner,
		() => provider.value.resolveCurrent({ context }),
	)
	return validatePrincipal(application, principal)
}

/**
 * Returns the principal of one bound request context, resolved at most once by
 * the application's single provider; `undefined` when anonymous.
 *
 * @example `const principal = await getRequestPrincipal(context)`
 */
export const getRequestPrincipal = (
	context: RequestContext,
): Promise<Principal | undefined> => {
	const application = getRequestContextOwner(context)
	if (application === undefined) return Promise.resolve(undefined)
	const cell = readCell(context)
	cell.resolution ??= resolveCell(context, application, cell)
	// Core validated a Pointer owned by the application; `Register` names its schema.
	return cell.resolution
}

/**
 * Returns the principal of the current request; server code outside a request
 * has none.
 *
 * @example `const principal = await getCurrentPrincipal()`
 */
export const getCurrentPrincipal = (): Promise<Principal | undefined> => {
	const engine = getActiveRequestEngine()
	return engine === undefined
		? Promise.resolve(undefined)
		: getRequestPrincipal(engine.context)
}
