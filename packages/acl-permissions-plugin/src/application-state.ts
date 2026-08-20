import { isDeepStrictEqual } from 'node:util'

import {
	FrameworkError,
	accessRoleResolverCapability,
	getCurrentEngine,
	getCurrentRequest,
	type AccessContext,
	type AccessPrincipalResolver,
	type AccessRoleResolver,
	type CompiledSchemaRegistry,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	createACLChangedEvent,
	type ACLChangedEvent,
	type ACLChangedOperation,
} from './acl-events.js'
import {
	aclFieldName,
	aclSchemaExtensionName,
	type ACLSchemaExtensionConfig,
} from './acl-extension.js'
import {
	resolveACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import { resolveACLAccessSubjects } from './acl-access.js'

export type PersistentRoleResolver = NonNullable<
	AccessRoleResolver['resolvePersistentRole']
>

interface ACLMutationItemPair {
	readonly originalItem: Readonly<Record<string, unknown>> | null
	readonly item: Readonly<Record<string, unknown>> | null
}

interface CreateACLApplicationStateOptions {
	readonly schemas: CompiledSchemaRegistry
	readonly protectedSchemas: readonly SchemaDefinition[]
	readonly pluginLimits: ResolvedACLEntryLimits
	readonly principalResolver: AccessPrincipalResolver | undefined
	readonly roleResolver: AccessRoleResolver | undefined
	readonly hasStaticRoleGrant: (config: ACLSchemaExtensionConfig) => boolean
	readonly readMutationItems: (
		schema: SchemaDefinition,
		input: unknown,
	) => readonly ACLMutationItemPair[]
	readonly snapshotACL: (value: unknown, path: string) => ACL
}

export interface ACLApplicationState {
	readonly collectACLChanges: (
		context: AccessContext,
		schema: SchemaDefinition,
		kind: ACLChangedOperation,
		input: unknown,
	) => Promise<readonly ACLChangedEvent[]>
	readonly protectedSchemas: readonly SchemaDefinition[]
	readonly protectedSchemaSet: ReadonlySet<SchemaDefinition>
	readonly readPersistentRoleResolver: () => PersistentRoleResolver | undefined
	readonly resolveSchemaLimits: (
		config: ACLSchemaExtensionConfig,
	) => ResolvedACLEntryLimits
	readonly resolveSubjects: () => ReturnType<typeof resolveACLAccessSubjects>
}

/** Creates the application-local identity cache shared by ACL capability factories and setup. */
export const createACLApplicationState = (
	options: CreateACLApplicationStateOptions,
): ACLApplicationState => {
	const {
		hasStaticRoleGrant,
		pluginLimits,
		principalResolver,
		protectedSchemas,
		readMutationItems,
		roleResolver,
		schemas,
		snapshotACL,
	} = options
	const protectedSchemaSet = new Set(protectedSchemas)
	const hasDeclaredRoleGrant = protectedSchemas.some((schema) => {
		const extension = schema.extensions.find(
			(candidate) => candidate.name === aclSchemaExtensionName,
		)

		return (
			extension !== undefined &&
			hasStaticRoleGrant(extension.config as ACLSchemaExtensionConfig)
		)
	})

	if (hasDeclaredRoleGrant && roleResolver === undefined) {
		throw new FrameworkError(
			'PLUGIN_CAPABILITY_MISSING',
			'ACL role grants require an active access role resolver capability.',
			{
				internalDetails: {
					capabilityId: accessRoleResolverCapability.capabilityId,
					kind: 'acl-role-resolver-required',
				},
			},
		)
	}

	const subjectCache = new WeakMap<
		object,
		ReturnType<typeof resolveACLAccessSubjects>
	>()
	const readPersistentRoleResolver = (): PersistentRoleResolver | undefined => {
		const persistentRoleResolver =
			roleResolver?.resolvePersistentRole?.bind(roleResolver)

		if (persistentRoleResolver === undefined) return undefined

		return ({ role }) =>
			persistentRoleResolver({
				// Providers resolve against the original request instead of a derived hook view.
				context: getCurrentRequest(),
				role,
			})
	}
	const resolveSubjects = (): ReturnType<typeof resolveACLAccessSubjects> => {
		// The engine is the stable cache owner shared by every hook context in one operation.
		const cacheKey = getCurrentEngine()
		const cached = subjectCache.get(cacheKey)

		if (cached !== undefined) return cached

		const resolution = resolveACLAccessSubjects(
			// Subject providers receive the original request, not a derived hook view.
			getCurrentRequest(),
			principalResolver,
			roleResolver,
			(schema) => schemas.get(schema.className) === schema,
		)
		subjectCache.set(cacheKey, resolution)
		return resolution
	}
	const resolveSchemaLimits = (
		config: ACLSchemaExtensionConfig,
	): ResolvedACLEntryLimits =>
		resolveACLEntryLimits(pluginLimits, config.limits)
	const emptyACLChangeValue = new ACL()
	const collectACLChanges = async (
		context: AccessContext,
		schema: SchemaDefinition,
		kind: ACLChangedOperation,
		input: unknown,
	): Promise<readonly ACLChangedEvent[]> => {
		const events: ACLChangedEvent[] = []
		for (const { item, originalItem } of readMutationItems(schema, input)) {
			if (item === null) continue

			const current = snapshotACL(item[aclFieldName], 'current acl')
			const previous =
				originalItem === null
					? emptyACLChangeValue
					: snapshotACL(originalItem[aclFieldName], 'previous acl')

			if (isDeepStrictEqual(previous.toJSON(), current.toJSON())) continue
			const itemId: unknown = item.id
			if (typeof itemId !== 'string' || itemId.length === 0) {
				throw new TypeError('ACL change event requires a materialized item id')
			}

			const subjects = await resolveSubjects()
			events.push(
				createACLChangedEvent({
					authority: context.access.mode,
					className: schema.className,
					current,
					itemId,
					operation: kind,
					previous,
					principal: subjects.principal,
				}),
			)
		}
		return immutableArray(events)
	}

	return {
		collectACLChanges,
		protectedSchemas,
		protectedSchemaSet,
		readPersistentRoleResolver,
		resolveSchemaLimits,
		resolveSubjects,
	}
}
