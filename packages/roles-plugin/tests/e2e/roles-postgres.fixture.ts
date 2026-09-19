import {
	MasterAuthority,
	RequestContextValue,
	Schema,
	UltimaBase,
	requestSubjectReferenceCleanupCapability,
	requestRoleResolverCapability,
	defineRequestSubjectReferenceCleanup,
	definePlugin,
	provideCapability,
	requireCapability,
	type RequestRoleResolver,
} from '@ultimabase/core'
import { allMutations, allOf, not } from '@ultimabase/access-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	postgresPlugin,
	type PostgresSchemaPolicy,
} from '@ultimabase/postgres-plugin'
import {
	RoleSchema,
	hasRole,
	onRoleEvent,
	provideRoleEventObserver,
	roleDeletedEvent,
	roleHierarchyChangedEvent,
	roleMembershipChangedEvent,
	rolesPlugin,
} from '@ultimabase/roles-plugin'

/** Carries a member identity without making authentication a Core feature. */
export const currentRoleMemberId = new RequestContextValue<string>(
	'fixture.roles.current-member-id',
	(value: unknown): string => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('Current role member id must be a non-empty string')
		}

		return value
	},
)

export const RoleMember = Schema.define({
	className: 'RoleE2EMember',
	fields: (field) => ({
		email: field.string({ indexed: 'unique', required: true }),
	}),
})

const protectedRoleOperations = {
	read: true,
	...allMutations(false),
}

/** Records principal resolution so request-local membership caching is observable. */
export const roleResolutionTrace: string[] = []
/** Records developer hooks independently from plugin-owned invariants. */
export const roleDeveloperHookTrace: string[] = []

export const AppRole = RoleSchema.define({
	className: 'RoleE2EAppRole',
	members: {
		schema: RoleMember,
		resolveCurrent: ({ context }) => {
			roleResolutionTrace.push('resolve-current')
			const memberId = context.getValue(currentRoleMemberId)

			return memberId === undefined ? undefined : RoleMember.pointer(memberId)
		},
	},
	deletion: { references: 'fail' },
	fields: (field) => ({
		description: field.string(),
		priority: field.int({ default: 0 }),
	}),
	indexes: [{ fields: ['priority', 'createdAt'] }],
	access: protectedRoleOperations,
	hooks: {
		beforeOperation: {
			update: ({ operation }) => {
				roleDeveloperHookTrace.push(operation.kind)

				void operation
			},
		},
	},
})

export const FailRole = RoleSchema.define({
	className: 'RoleE2EFailRole',
	members: { schema: RoleMember },
	deletion: { references: 'fail' },
	fields: () => ({}),
	access: protectedRoleOperations,
})

export const PreserveRole = RoleSchema.define({
	className: 'RoleE2EPreserveRole',
	members: { schema: RoleMember },
	deletion: { references: 'preserve' },
	fields: () => ({}),
	access: { ...protectedRoleOperations, delete: true },
})

export const CascadeRole = RoleSchema.define({
	className: 'RoleE2ECascadeRole',
	members: { schema: RoleMember },
	deletion: { references: 'cascade' },
	fields: () => ({}),
	access: {
		// Native Access permits deletion so the plugin's master-only cascade guard is exercised.
		...protectedRoleOperations,
		delete: true,
	},
})

export const EditorReference = AppRole.role('editor')
export const AdministratorReference = AppRole.role('administrator')

export const ProtectedPost = Schema.define({
	className: 'RoleE2EProtectedPost',
	fields: (field) => ({
		internalNote: field.string({
			access: {
				read: {
					orderBy: hasRole(AdministratorReference),
					output: hasRole(AdministratorReference),
					where: hasRole(AdministratorReference),
				},
			},
		}),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
	access: {
		create: false,
		delete: hasRole(AdministratorReference),
		read: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
		},
		update: allOf(
			hasRole(EditorReference),
			hasRole(AdministratorReference),
			not(false),
		),
	},
})

/** Exposes neutral external references used to verify all deletion policies. */
export const ExternalRoleReference = Schema.define({
	className: 'RoleE2EExternalReference',
	fields: (field) => ({
		subject: field.string({ indexed: true, required: true }),
	}),
})

export let missingProviderHookCalls = 0

export const resetMissingProviderHookCalls = (): void => {
	missingProviderHookCalls = 0
}

export const MissingProviderPost = Schema.define({
	className: 'RoleE2EMissingProviderPost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
	access: {
		create: true,
		read: true,
		update: hasRole(EditorReference),
	},
	hooks: {
		beforeOperation: {
			update: ({ operation }) => {
				missingProviderHookCalls += 1
				void operation
			},
		},
	},
})

export const committedRoleEvents: string[] = []
/** Records every trusted terminal elevation used by the role application. */
export const masterRoleAccessReasons: string[] = []
let rejectNextExternalCleanup = false

export const rejectNextRoleReferenceCleanup = (): void => {
	rejectNextExternalCleanup = true
}

const readReferenceValue = (value: string | number): string =>
	typeof value === 'string' ? value : String(value)

const externalRoleReferenceCleanup = defineRequestSubjectReferenceCleanup({
	kind: 'role',
	hasReferences: ({ reference }) =>
		ExternalRoleReference.exists(
			{
				where: {
					subject: { eq: readReferenceValue(reference.value) },
				},
			},
			{ useMasterKey: true },
		),
	cleanup: async ({ reference }) => {
		const rows = await ExternalRoleReference.findMany(
			{
				where: {
					subject: { eq: readReferenceValue(reference.value) },
				},
				select: { id: true },
			},
			{ useMasterKey: true },
		)
		if (rows.length > 0) {
			await ExternalRoleReference.deleteMany(
				{ where: rows.map(({ id }) => ({ id: { eq: id } })) },
				{ useMasterKey: true },
			)
		}

		if (rejectNextExternalCleanup) {
			rejectNextExternalCleanup = false
			throw new Error('external role cleanup rollback fixture')
		}
	},
})

/** Owns external-reference cleanup without importing a roles implementation. */
export const externalRoleReferencePlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.external-role-references',
	peers: [{ pluginId: 'ultimabase.roles', version: '^0.0.0' }],
	privileges: [
		{
			name: 'runtime:observe',
			reason: 'Observes committed role events for the E2E fixture.',
		},
	],
	capabilities: {
		provides: [
			provideCapability(requestSubjectReferenceCleanupCapability, {
				contributionId: 'external-role-reference-cleanup',
				create: () => ({
					value: {
						cleanup: externalRoleReferenceCleanup,
						name: 'fixture.external-role-reference-cleanup',
					},
				}),
			}),
			provideRoleEventObserver(
				'fixture.observe:deleted',
				onRoleEvent(roleDeletedEvent, ({ event }) => {
					committedRoleEvents.push(event.name)
				}),
			),
			provideRoleEventObserver(
				'fixture.observe:hierarchy',
				onRoleEvent(roleHierarchyChangedEvent, ({ event }) => {
					committedRoleEvents.push(event.name)
				}),
			),
			provideRoleEventObserver(
				'fixture.observe:membership',
				onRoleEvent(roleMembershipChangedEvent, ({ event }) => {
					committedRoleEvents.push(event.name)
				}),
			),
		],
	},
})

const roleResolverRequirement = requireCapability(
	requestRoleResolverCapability,
	'^1.0.0',
)
export const roleResolverConsumerPluginName =
	'fixture.roles.resolver-consumer' as const
const roleResolverConsumerPlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: roleResolverConsumerPluginName,
	capabilities: { requires: [roleResolverRequirement] },
	setup: ({ capabilities }): RequestRoleResolver =>
		capabilities.get(roleResolverRequirement),
})

export const roleSchemas = [
	RoleMember,
	AppRole,
	FailRole,
	PreserveRole,
	CascadeRole,
	ProtectedPost,
	ExternalRoleReference,
	MissingProviderPost,
] as const

export const createRoleApplication = (
	connectionUri: string,
	schemaPolicy: PostgresSchemaPolicy = 'override',
) =>
	new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'roles-e2e-master', value: 'server-only' }],
			onUse: ({ reason }) => {
				masterRoleAccessReasons.push(reason)
			},
		}),
		plugins: [
			hooksPlugin(),
			accessPlugin({ default: true }),
			externalRoleReferencePlugin,
			rolesPlugin(),
			roleResolverConsumerPlugin,
			postgresPlugin({ schemaPolicy, url: connectionUri }),
		],
		schemas: roleSchemas,
		validation: {
			clock: () => new Date('2026-08-04T10:00:00.000Z'),
			timezone: 'UTC',
		},
	})

/** Creates a roles-free application used to prove the neutral provider boundary. */
export const createProviderBoundaryApplication = (
	connectionUri: string,
	provider: 'community' | 'missing',
) => {
	const communityProvider = definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.community-role-provider-e2e',
		capabilities: {
			provides: [
				provideCapability(requestRoleResolverCapability, {
					contributionId: 'community-role-resolver',
					create: () => ({ value: { hasRole: () => true } }),
				}),
			],
		},
	})

	return new UltimaBase({
		plugins: [
			hooksPlugin(),
			accessPlugin({ default: true }),
			...(provider === 'community' ? [communityProvider] : []),
			postgresPlugin({ schemaPolicy: 'ignore', url: connectionUri }),
		],
		schemas: [MissingProviderPost],
	})
}
