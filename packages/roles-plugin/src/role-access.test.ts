import { onTestFinished, describe, expect, it, vi, type Mock } from 'vitest'
import {
	RequestSubjectReference,
	Schema,
	requestRoleResolverCapability,
	UltimaBase,
	plugin,
	contributeApplication,
	provideCapability,
	requireCapability,
} from '@ultimabase/core'
import type { AccessContext } from '@ultimabase/access-plugin'

import {
	createStoredRoleResolver,
	hasRole,
	type StoredRoleResolverDependencies,
} from './role-access.js'
import { getRoleReferenceState } from './role-reference.js'
import { RoleSchema } from './role-schema.js'
import { rolesPlugin } from './plugin.js'

const roleResolverRequirement = requireCapability(
	requestRoleResolverCapability,
	'^1.0.0',
)

const roleResolverConsumer = <const TPluginId extends string>(
	pluginId: TPluginId,
) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: pluginId,
		contributions: [
			roleResolverRequirement,
			contributeApplication(({ capabilities }) => ({
				exports: capabilities.get(roleResolverRequirement),
			})),
		],
	})

const Member = Schema.define({
	className: 'AccessRoleMember',
	fields: () => ({}),
})
const AppRole = RoleSchema.define({
	className: 'AccessAppRole',
	members: { schema: Member },
	fields: () => ({}),
})
const OtherRole = RoleSchema.define({
	className: 'AccessOtherRole',
	members: { schema: Member },
	fields: () => ({}),
})
const editorId = '123e4567-e89b-42d3-a456-426614174001'
const administratorId = '123e4567-e89b-42d3-a456-426614174002'

const createContext = (requestId: string): AccessContext => ({
	access: { mode: 'anonymous' },
	getValue: () => undefined,
	hasCapability: () => false,
	requestId,
	signal: new AbortController().signal,
	source: 'test',
})

type MembershipResolver = StoredRoleResolverDependencies['resolveMembership']
type ReferenceResolver = StoredRoleResolverDependencies['resolveReferenceId']

const createDependencies = (): Readonly<{
	dependencies: StoredRoleResolverDependencies
	membership: Mock<MembershipResolver>
	references: Mock<ReferenceResolver>
}> => {
	const membership = vi.fn<MembershipResolver>(() =>
		Promise.resolve([editorId, administratorId] as readonly string[]),
	)
	const references = vi.fn<ReferenceResolver>((reference) => {
		const selector = getRoleReferenceState(reference)?.selector

		return Promise.resolve(
			selector !== undefined && 'id' in selector
				? selector.id
				: selector?.name === 'editor'
					? editorId
					: undefined,
		)
	})

	return {
		dependencies: {
			getRequestCacheKey: (context) => context,
			resolveMembership: membership,
			resolveReferenceId: references,
		},
		membership,
		references,
	}
}

describe('stored role Access integration', () => {
	it('memoizes one membership snapshot and each reference per request domain', async () => {
		const fixture = createDependencies()
		const resolver = createStoredRoleResolver([AppRole], fixture.dependencies)
		const context = createContext('memoized-role-request')
		const editor = AppRole.role('editor')
		const administrator = AppRole.role({ id: administratorId })

		await expect(resolver.hasRole({ context, role: editor })).resolves.toBe(
			true,
		)
		await expect(resolver.hasRole({ context, role: editor })).resolves.toBe(
			true,
		)
		await expect(
			resolver.hasRole({ context, role: administrator }),
		).resolves.toBe(true)
		expect(fixture.membership).toHaveBeenCalledTimes(1)
		expect(fixture.references).toHaveBeenCalledTimes(2)
	})

	it('lists current roles from the same request-local membership snapshot', async () => {
		const fixture = createDependencies()
		const resolver = createStoredRoleResolver([AppRole], fixture.dependencies)
		const context = createContext('current-role-list')

		const roles = await resolver.resolveCurrentRoles?.({ context })
		await resolver.hasRole({ context, role: AppRole.role({ id: editorId }) })

		expect(roles?.map(({ value }) => value)).toHaveLength(2)
		expect(fixture.membership).toHaveBeenCalledOnce()
	})

	it('resolves names to stable UUID references without loading membership', async () => {
		const fixture = createDependencies()
		const resolver = createStoredRoleResolver([AppRole], fixture.dependencies)
		const context = createContext('persistent-role-reference')
		const resolved = await resolver.resolvePersistentRole?.({
			context,
			role: AppRole.role('editor'),
		})

		expect(resolved).toBeDefined()
		if (resolved === undefined) {
			throw new TypeError('Persistent role resolution must return a reference')
		}
		expect(getRoleReferenceState(resolved)?.selector).toStrictEqual({
			id: editorId,
		})
		expect(fixture.references).toHaveBeenCalledOnce()
		expect(fixture.membership).not.toHaveBeenCalled()
	})

	it('restores serialized official references without relying on WeakMap identity', async () => {
		const fixture = createDependencies()
		const resolver = createStoredRoleResolver([AppRole], fixture.dependencies)
		const original = AppRole.role({ id: editorId })
		const restored = new RequestSubjectReference('role', original.value)

		await expect(
			resolver.hasRole({
				context: createContext('restored-role-reference'),
				role: restored,
			}),
		).resolves.toBe(true)
	})

	it('isolates caches by request and rejects foreign role domains normally', async () => {
		const fixture = createDependencies()
		const resolver = createStoredRoleResolver([AppRole], fixture.dependencies)
		const editor = AppRole.role('editor')

		await resolver.hasRole({ context: createContext('first'), role: editor })
		await resolver.hasRole({ context: createContext('second'), role: editor })
		await expect(
			resolver.hasRole({
				context: createContext('foreign'),
				role: OtherRole.role('editor'),
			}),
		).resolves.toBe(false)
		expect(fixture.membership).toHaveBeenCalledTimes(2)
	})

	it('denies unresolved members before resolving a stored role reference', async () => {
		const references = vi.fn(() => Promise.resolve(editorId))
		const resolver = createStoredRoleResolver([AppRole], {
			getRequestCacheKey: (context) => context,
			resolveMembership: () => Promise.resolve(undefined),
			resolveReferenceId: references,
		})

		await expect(
			resolver.hasRole({
				context: createContext('unresolved-member'),
				role: AppRole.role('editor'),
			}),
		).resolves.toBe(false)
		expect(references).not.toHaveBeenCalled()
	})

	it('denies omitted current-member resolution without an implicit master grant', async () => {
		const resolver = createStoredRoleResolver([AppRole], {
			getRequestCacheKey: (context) => context,
			resolveMembership: () => Promise.resolve(undefined),
			resolveReferenceId: () => Promise.resolve(editorId),
		})
		const masterContext: AccessContext = {
			...createContext('master-without-member'),
			access: {
				keyId: 'test-master',
				mode: 'master',
				reason: 'verify role membership semantics',
			},
		}

		await expect(
			resolver.hasRole({
				context: masterContext,
				role: AppRole.role({ id: editorId }),
			}),
		).resolves.toBe(false)
	})

	it('provides the neutral resolver for zero or multiple discovered domains', async () => {
		const emptyConsumer = roleResolverConsumer('fixture.empty-role-consumer')
		const roleConsumer = roleResolverConsumer('fixture.role-consumer')
		const emptyApplication = new UltimaBase({
			schemas: [],
			plugins: [rolesPlugin(), emptyConsumer],
		})
		await emptyApplication.initialize()
		onTestFinished(() => emptyApplication.dispose())
		const emptyConsumerExports = emptyApplication.plugin(
			'fixture.empty-role-consumer',
		)
		await emptyApplication.dispose()
		const roleApplication = new UltimaBase({
			schemas: [Member, AppRole, OtherRole],
			plugins: [rolesPlugin(), roleConsumer],
		})
		await roleApplication.initialize()
		onTestFinished(() => roleApplication.dispose())

		expect(typeof emptyConsumerExports.hasRole).toBe('function')
		expect(typeof roleApplication.plugin('fixture.role-consumer').hasRole).toBe(
			'function',
		)

		await Promise.all([emptyApplication.dispose(), roleApplication.dispose()])
	})

	it('keeps a compatible community provider independent from rolesPlugin', async () => {
		const communityResolver = {
			hasRole: () => true,
		}
		const communityProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.community-role-provider',
			contributions: [
				provideCapability(requestRoleResolverCapability, {
					contributionId: 'community-role-resolver',
					create: () => ({ value: communityResolver }),
				}),
			],
		})
		const consumer = roleResolverConsumer('fixture.community-role-consumer')
		const application = new UltimaBase({
			schemas: [],
			plugins: [communityProvider, consumer],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())

		expect(application.plugin('fixture.community-role-consumer')).toBe(
			communityResolver,
		)
		await application.dispose()
	})

	it('creates a compact neutral decision without capturing a provider', () => {
		const decision = hasRole(AppRole.role('editor'))

		expect(decision).toBeTypeOf('function')
		expect(() =>
			hasRole({ kind: 'role' } as unknown as Parameters<typeof hasRole>[0]),
		).toThrow(new TypeError('hasRole requires an Access role reference'))
	})
})
