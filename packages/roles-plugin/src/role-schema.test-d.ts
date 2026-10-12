import { UltimaBase, type PolicyPredicate } from '@ultimabase/core'
import type { PluginExports } from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import { hasRole, rolesPlugin } from './index.js'
import type { RolesPluginExports } from './index.js'

test('exports has and current through ultimabase.plugin(rolesPlugin)', () => {
	expectTypeOf<
		PluginExports<ReturnType<typeof rolesPlugin>>
	>().toEqualTypeOf<RolesPluginExports>()
	expectTypeOf(rolesPlugin.pluginId).toEqualTypeOf<'@ultimabase/roles-plugin'>()
})

const Roles = UltimaBase.use(rolesPlugin())
const User = Roles.Schema.define({
	className: 'TypedRoleUser',
	fields: (field) => ({
		email: field.string({ required: true }),
	}),
}).with({})
const AppRole = Roles.RoleSchema.define({
	className: 'TypedAppRole',
	members: () => User,
	fields: (field) => ({ description: field.string() }),
}).with({})
const TeamRole = Roles.RoleSchema.define({
	className: 'TypedTeamRole',
	members: () => User,
	ensure: ['lead'],
}).with({})

test('keeps role statics available after .with(...)', () => {
	expectTypeOf(AppRole.role('editor').kind).toEqualTypeOf<'role'>()
	expectTypeOf(TeamRole.role({ id: 'x' }).kind).toEqualTypeOf<'role'>()
	expectTypeOf(hasRole(AppRole.role('editor'))).toBeFunction()
	// A Core predicate: no package link from Roles to Access (ADR-0304).
	expectTypeOf(hasRole(AppRole.role('editor'))).toEqualTypeOf<PolicyPredicate>()
})

test('types role fields, members and included roles', async () => {
	const role = await AppRole.findOne({
		where: { members: { some: { email: { eq: 'a@b.test' } } } },
	})
	expectTypeOf(role?.name).toEqualTypeOf<string | undefined>()
	expectTypeOf(role?.description).toEqualTypeOf<string | null | undefined>()
	await AppRole.findMany({
		where: { includedRoles: { some: { description: { eq: 'x' } } } },
	})
	await AppRole.findMany({
		// @ts-expect-error -- members are TypedRoleUser rows.
		where: { members: { some: { description: { eq: 'x' } } } },
	})
	await AppRole.updateOne({
		where: { id: 'role-id' },
		data: { includedRoles: { connect: ['child-id'] } },
	})
	await AppRole.updateOne({
		where: { id: 'role-id' },
		// @ts-expect-error -- the hierarchy field is `includedRoles` (ADR-0322).
		data: { roles: { connect: ['child-id'] } },
	})
})

test('rejects invalid deletion policies and unknown options', () => {
	Roles.RoleSchema.define({
		className: 'TypedInvalidDeletionRole',
		members: () => User,
		// @ts-expect-error -- Deletion behavior is one closed schema-owned policy.
		deletion: 'remove',
	})

	Roles.RoleSchema.define({
		className: 'TypedLegacyMembersRole',
		members: () => User,
		// @ts-expect-error -- Rules and indexes go in `.with(...)`.
		access: { read: true },
	})

	Roles.RoleSchema.define({
		className: 'TypedForgedIdentityRole',
		members: () => User,
		// @ts-expect-error -- The compiler-only marker has no public authoring surface.
		'ultimabase.roles.identity': {},
	})
})

test('exists only on applications that install Roles', () => {
	// @ts-expect-error -- No RoleSchema factory without rolesPlugin().
	void UltimaBase.use().RoleSchema
	expectTypeOf<typeof Roles.RoleSchema.define>().toBeFunction()
})
