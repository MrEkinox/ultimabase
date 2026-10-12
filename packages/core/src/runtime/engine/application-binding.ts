import { randomBytes } from 'node:crypto'

import { isRunningApplicationWork } from '../../application/active-application.js'
import {
	readApplicationKernelState,
	readApplicationLog,
} from '../../application/application-kernel-state.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { NormalizedOperationOptions } from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	getMasterRequestContextProvenance,
	getRequestContextOwner,
	isRequestContext,
	setRequestContextOwner,
	type RequestContext,
} from '../context/request-context.js'
import {
	MasterAuthority,
	elevateTrustedMasterRequest,
} from '../master/master-authority.js'

type EngineApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

/** Prevents public request work until every startup phase completed successfully. */
export const assertApplicationRequestExecutionAvailable = (
	application: EngineApplication,
): void => {
	if (
		application.state !== 'started' &&
		!(
			isRunningApplicationWork(application) &&
			(application.state === 'stopping' || application.state === 'disposing')
		)
	) {
		throw new TypeError(
			`Application request execution requires a started application; received ${application.state}`,
		)
	}
}

// One keyless authority per application, created only when a plugin holding
// `authority:elevate` elevates while the application configured no
// `masterAuthority` (ADR-0326): the privilege is the authorization, the
// application logger the audit sink. Its key never leaves this module.
const pluginElevationAuthorities = new WeakMap<object, MasterAuthority>()

const readPluginElevationAuthority = (application: object): MasterAuthority => {
	const existing = pluginElevationAuthorities.get(application)
	if (existing !== undefined) return existing
	const authority = new MasterAuthority({
		keys: [
			{ id: 'plugin-elevation', value: randomBytes(32).toString('base64url') },
		],
		onUse: (event) => {
			readApplicationLog(application).debug('Plugin elevated to Master', {
				reason: event.reason,
				requestId: event.requestId,
			})
		},
	})
	pluginElevationAuthorities.set(application, authority)
	return authority
}

/** Claims an unbound context or rejects reuse across isolated applications. */
export const bindRequestContextToApplication = (
	application: EngineApplication,
	context: RequestContext,
	masterAuthority: object | undefined,
): void => {
	const owner = getRequestContextOwner(context)

	if (context.access.mode === 'master') {
		const provenance = getMasterRequestContextProvenance(context)
		if (
			provenance?.application !== application ||
			(provenance.authority !== masterAuthority &&
				provenance.authority !== pluginElevationAuthorities.get(application)) ||
			owner !== application
		) {
			throw new FrameworkError(
				'PERMISSION_DENIED',
				'Explicit master context was not issued by this application authority.',
				{
					publicMessage: 'Master authority is not available.',
					internalDetails: { reason: 'master-context-provenance-mismatch' },
				},
			)
		}
		return
	}

	if (owner === undefined) {
		setRequestContextOwner(context, application)
	} else if (owner !== application) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Explicit request context belongs to another application.',
			{
				publicMessage: 'The request context is not available.',
				internalDetails: { reason: 'operation-context-application-mismatch' },
			},
		)
	}
}

/** Requires the configured authority only when a trusted elevation is requested. */
export const requireMasterAuthority = (
	authority: MasterAuthority | undefined,
): MasterAuthority => {
	if (authority !== undefined) return authority
	throw new FrameworkError(
		'PERMISSION_DENIED',
		'Master authority is not configured for this framework engine.',
		{ publicMessage: 'Master authority is not available.' },
	)
}

/** Checks the exact active plugin owner before audit or another elevation effect. */
export const assertMasterElevationPrivilege = (application: object): void => {
	const owner = readApplicationPluginOwner(application)
	if (owner !== undefined) {
		readApplicationKernelState(application).assertPrivilege(
			owner,
			'authority:elevate',
		)
	}
}

/**
 * Applies trusted server-only terminal options: an explicit application-bound
 * context first, then audited Master elevation with a stable reason.
 */
export const resolveTerminalContext = async (
	application: EngineApplication,
	masterAuthority: MasterAuthority | undefined,
	current: RequestContext,
	options: NormalizedOperationOptions,
	auditReason: () => string,
): Promise<RequestContext> => {
	let context = current
	if (options.context !== undefined) {
		if (!isRequestContext(options.context)) {
			throw new TypeError('operation context must be a RequestContext instance')
		}
		bindRequestContextToApplication(
			application,
			options.context,
			masterAuthority,
		)
		context = options.context
	}
	if (options.useMasterKey) {
		assertMasterElevationPrivilege(application)
		// A plugin's own `authority:elevate` suffices without a configured
		// authority; application code still requires one.
		const authority =
			masterAuthority ??
			(readApplicationPluginOwner(application) === undefined
				? requireMasterAuthority(undefined)
				: readPluginElevationAuthority(application))
		context = await elevateTrustedMasterRequest(
			authority,
			context,
			auditReason(),
			application,
		)
	}
	return context
}
