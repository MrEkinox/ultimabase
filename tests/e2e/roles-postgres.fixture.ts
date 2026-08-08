import {
	MasterAuthority,
	RequestContextValue,
	Schema,
	UltimaBase,
	accessRoleResolverServiceToken,
	allMutations,
	allOf,
	anyOf,
	booleanField,
	defineAccessReferenceCleanup,
	definePlugin,
	intField,
	not,
	onEvent,
	stringField,
	type AccessContext,
} from '@ultimabase/core'
import {
	postgresPlugin,
	type PostgresSchemaPolicy,
} from '@ultimabase/postgres-plugin'
import {
	RoleSchema,
	hasRole,
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
	fields: {
		email: stringField({ indexed: 'unique', validation: { required: true } }),
	},
})

const masterOnly = ({
	context,
}: {
	readonly context: AccessContext
}): boolean => context.access.mode === 'master'
const protectedRoleOperations = {
	read: true,
	...allMutations(masterOnly),
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
	fields: {
		description: stringField(),
		priority: intField({ default: 0 }),
	},
	indexes: [{ fields: ['priority', 'createdAt'] }],
	access: { operation: protectedRoleOperations },
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
	fields: {},
	access: { operation: protectedRoleOperations },
})

export const PreserveRole = RoleSchema.define({
	className: 'RoleE2EPreserveRole',
	members: { schema: RoleMember },
	deletion: { references: 'preserve' },
	fields: {},
	access: {
		operation: { ...protectedRoleOperations, delete: true },
	},
})

export const CascadeRole = RoleSchema.define({
	className: 'RoleE2ECascadeRole',
	members: { schema: RoleMember },
	deletion: { references: 'cascade' },
	fields: {},
	access: {
		// Native Access permits deletion so the plugin's master-only cascade guard is exercised.
		operation: { ...protectedRoleOperations, delete: true },
	},
})

export const EditorReference = AppRole.role('editor')
export const AdministratorReference = AppRole.role('administrator')

export const ProtectedPost = Schema.define({
	className: 'RoleE2EProtectedPost',
	access: {
		operation: {
			create: masterOnly,
			delete: hasRole(AdministratorReference),
			read: true,
			update: anyOf(
				masterOnly,
				allOf(
					hasRole(EditorReference),
					hasRole(AdministratorReference),
					not(false),
				),
			),
		},
		filter: {
			read: ({ filter }) => filter.equalTo('published', true),
		},
	},
	fields: {
		internalNote: stringField({
			access: {
				read: anyOf(masterOnly, hasRole(AdministratorReference)),
			},
		}),
		published: booleanField({ default: false }),
		title: stringField({ validation: { required: true } }),
	},
})

/** Exposes neutral external references used to verify all deletion policies. */
export const ExternalRoleReference = Schema.define({
	className: 'RoleE2EExternalReference',
	fields: {
		subject: stringField({ indexed: true, validation: { required: true } }),
	},
})

export let missingProviderHookCalls = 0

export const resetMissingProviderHookCalls = (): void => {
	missingProviderHookCalls = 0
}

export const MissingProviderPost = Schema.define({
	className: 'RoleE2EMissingProviderPost',
	access: {
		operation: {
			create: true,
			read: true,
			update: hasRole(EditorReference),
		},
	},
	fields: {
		title: stringField({ validation: { required: true } }),
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

/** Owns external-reference cleanup without importing a roles implementation. */
export const externalRoleReferencePlugin = definePlugin({
	name: 'fixture.external-role-references',
	setup: ({ registries }) => {
		registries.commands.register(
			'fixture.external-role-reference-cleanup',
			defineAccessReferenceCleanup({
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
					await ExternalRoleReference.deleteMany(
						{
							where: (where) =>
								where.eq('subject', readReferenceValue(reference.value)),
						},
						{ useMasterKey: true },
					)

					if (rejectNextExternalCleanup) {
						rejectNextExternalCleanup = false
						throw new Error('external role cleanup rollback fixture')
					}
				},
			}),
		)

		for (const eventName of [
			roleDeletedEvent,
			roleHierarchyChangedEvent,
			roleMembershipChangedEvent,
		]) {
			registries.events.register(
				`fixture.observe:${eventName}`,
				onEvent({
					name: eventName,
					handler: ({ event }) => {
						committedRoleEvents.push(event.name)
					},
				}),
			)
		}
	},
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
			externalRoleReferencePlugin,
			rolesPlugin(),
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
		name: 'fixture.community-role-provider-e2e',
		setup: ({ services }) => {
			services.provide(accessRoleResolverServiceToken, {
				hasRole: () => true,
			})
		},
	})

	return new UltimaBase({
		plugins: [
			...(provider === 'community' ? [communityProvider] : []),
			postgresPlugin({ schemaPolicy: 'ignore', url: connectionUri }),
		],
		schemas: [MissingProviderPost],
	})
}
