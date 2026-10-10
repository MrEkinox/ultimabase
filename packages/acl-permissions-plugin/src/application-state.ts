import { isDeepStrictEqual } from 'node:util'

import {
	FrameworkError,
	getCurrentEngine,
	getCurrentRequest,
	getOperationSchema,
	getRequestPrincipal,
	optionalCapability,
	requestRoleResolverCapability,
	Schema,
	type ApplicationCapabilityFactoryContext,
	type CapabilityRequirement,
	type DatabaseMutationMaterializationSource,
	type RequestRoleResolver,
	type RequestSubjectContext,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	resolveACLAccessSubjects,
	type ACLAccessSubjects,
} from './acl-access.js'
import {
	createACLChangedEvent,
	type ACLChangedEvent,
	type ACLChangedOperation,
} from './acl-events.js'
import {
	resolveACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import {
	aclFieldName,
	readProtectedSchemaOptions,
	type NormalizedACLSchemaOption,
} from './acl-option.js'
import {
	hasStaticRoleGrant,
	snapshotResolvedACL,
	type PersistentRoleResolver,
} from './acl-operation-resolution.js'

/** Discovers the optional role provider after setup, in any install order. */
export const optionalRoleResolver: CapabilityRequirement<
	typeof requestRoleResolverCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(requestRoleResolverCapability, '^1.0.0')

/** Reads the exact application schema retained by a normalized operation. */
const readOperationSchema = (
	operation: RuntimeLogicalOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Runtime operation schema node is invalid')
	}
	return schema
}

/** Describes one ACL-enabled schema with its effective entry limits. */
interface ProtectedSchemaOption {
	readonly config: NormalizedACLSchemaOption
	readonly limits: ResolvedACLEntryLimits
	readonly schema: SchemaDefinition
}

/** Holds the application-local facts shared by every ACL Runtime provider. */
export interface ACLApplicationState {
	/** Returns the ACL configuration of an operation's schema, if it is protected. */
	readonly protectedOption: (
		operation: RuntimeLogicalOperationAst,
	) => ProtectedSchemaOption | undefined
	readonly persistentRoleResolver: PersistentRoleResolver | undefined
	/** Resolves request subjects once per engine, shared by every hook context. */
	readonly resolveSubjects: () => Promise<ACLAccessSubjects>
	readonly collectACLChanges: (
		context: RequestSubjectContext,
		schema: SchemaDefinition,
		kind: ACLChangedOperation,
		input: DatabaseMutationMaterializationSource,
	) => Promise<readonly ACLChangedEvent[]>
}

const emptyACL = new ACL()

const createACLApplicationState = (
	{ callbacks, capabilities, schemas }: ApplicationCapabilityFactoryContext,
	pluginLimits: ResolvedACLEntryLimits,
): ACLApplicationState => {
	const configs = readProtectedSchemaOptions(schemas)
	const options = new Map<SchemaDefinition, ProtectedSchemaOption>()
	for (const [schema, config] of configs) {
		const limits = resolveACLEntryLimits(pluginLimits, config.limits)
		options.set(schema, { config, limits, schema })
	}
	const role = capabilities.contributions(optionalRoleResolver)[0]

	if (role === undefined && [...configs.values()].some(hasStaticRoleGrant)) {
		throw new FrameworkError(
			'PLUGIN_CAPABILITY_MISSING',
			'ACL role grants require an active access role resolver capability.',
			{
				internalDetails: {
					capabilityId: requestRoleResolverCapability.capabilityId,
					kind: 'acl-role-resolver-required',
				},
			},
		)
	}

	// Provider callbacks keep their exact owner so Core attributes their effects.
	const resolveCurrentRoles = role?.value.resolveCurrentRoles?.bind(role.value)
	const resolvePersistentRole = role?.value.resolvePersistentRole?.bind(
		role.value,
	)
	const roleResolver: Partial<RequestRoleResolver> =
		role === undefined || resolveCurrentRoles === undefined
			? {}
			: {
					resolveCurrentRoles: (input) =>
						callbacks.runPlugin(role.owner, () => resolveCurrentRoles(input)),
				}

	const subjectCache = new WeakMap<object, Promise<ACLAccessSubjects>>()
	const resolveSubjects = (): Promise<ACLAccessSubjects> => {
		// The engine is the stable cache owner shared by every hook context in one operation.
		const cacheKey = getCurrentEngine()
		const cached = subjectCache.get(cacheKey)
		if (cached !== undefined) return cached

		// Subject providers receive the original request, not a derived hook view;
		// Core resolves its principal once per request (ADR-0304).
		const request = getCurrentRequest()
		const resolution = getRequestPrincipal(request).then((principal) =>
			resolveACLAccessSubjects(request, principal, roleResolver),
		)
		subjectCache.set(cacheKey, resolution)
		return resolution
	}

	return {
		protectedOption: (operation) => options.get(readOperationSchema(operation)),
		persistentRoleResolver:
			role === undefined || resolvePersistentRole === undefined
				? undefined
				: ({ role: reference }) => {
						// Providers resolve against the original request, not a hook view.
						const input = { context: getCurrentRequest(), role: reference }
						return callbacks.runPlugin(role.owner, () =>
							resolvePersistentRole(input),
						)
					},
		resolveSubjects,
		collectACLChanges: async (context, schema, kind, input) => {
			const events: ACLChangedEvent[] = []
			// Core has already validated and frozen these complete mutation snapshots.
			for (const materialization of input.materializations) {
				if (materialization.kind === 'delete') continue

				const item = materialization.current
				const current = snapshotResolvedACL(item[aclFieldName], 'current acl')
				const previous =
					materialization.kind === 'create'
						? emptyACL
						: snapshotResolvedACL(
								materialization.previous[aclFieldName],
								'previous acl',
							)

				if (isDeepStrictEqual(previous.toJSON(), current.toJSON())) continue
				const itemId: unknown = item.id
				if (typeof itemId !== 'string' || itemId.length === 0) {
					throw new TypeError(
						'ACL change event requires a materialized item id',
					)
				}

				events.push(
					createACLChangedEvent({
						authority: context.access.mode,
						className: schema.className,
						current,
						itemId,
						operation: kind,
						previous,
						principal: (await resolveSubjects()).principal,
					}),
				)
			}
			return immutableArray(events)
		},
	}
}

/** Creates one application state per compiled schema registry, built on first use. */
export const createACLApplicationStateReader = (
	pluginLimits: ResolvedACLEntryLimits,
): ((context: ApplicationCapabilityFactoryContext) => ACLApplicationState) => {
	const states = new WeakMap<object, ACLApplicationState>()

	return (context) => {
		const existing = states.get(context.schemas)
		if (existing !== undefined) return existing
		const state = createACLApplicationState(context, pluginLimits)
		states.set(context.schemas, state)
		return state
	}
}
