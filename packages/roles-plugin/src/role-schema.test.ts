import { onTestFinished, describe, expect, it } from 'vitest'
import { Schema, UltimaBase, stringField } from '@ultimabase/core'

import type { FrameworkError } from '@ultimabase/core'

import { rolesPlugin } from './plugin.js'
import { getRoleSchemaDeclaration } from './role-schema.js'
import { roleSchemaIdentityOptionName } from './role-schema-identity.js'
import {
	QueryBuilder,
	plugin,
	contributeApplication,
} from '@ultimabase/core/plugin'

/** Calls `new` on a value whose type has no construct signature (ADR-0310). */
const construct = (target: unknown, args: readonly unknown[]): unknown => {
	if (typeof target !== 'function') throw new TypeError('Expected a class')
	return Reflect.construct(target, args)
}

const Roles = UltimaBase.use(rolesPlugin())
const User = UltimaBase.Schema.define({
	className: 'RoleUser',
	fields: (field) => ({
		email: field.string({ required: true }),
	}),
})

describe('App.RoleSchema', () => {
	it('exists only on applications that install Roles', () => {
		expect(Object.isFrozen(Roles.RoleSchema)).toBe(true)
		expect('RoleSchema' in UltimaBase).toBe(false)
		const ConfiguredRole = Roles.RoleSchema.define({
			className: 'ConfiguredRole',
			members: () => User,
			fields: (field) => ({ description: field.string() }),
		})

		expect(ConfiguredRole.fields).toHaveProperty('description')
		// ADR-0310: role schemas are not constructible and carry no role methods.
		expect(() => construct(ConfiguredRole, [{ name: 'draft' }])).toThrow(
			new TypeError(
				'ConfiguredRole is not constructible: create rows with ConfiguredRole.createOne({ data })',
			),
		)
		expect(() =>
			Roles.RoleSchema.define({
				className: 'InvalidMembersRole',
				members: User as unknown as () => typeof User,
			}),
		).toThrow(
			new TypeError(
				'members must return the member schema: members: () => User',
			),
		)
		expect(() =>
			Roles.RoleSchema.define({
				className: 'UnknownOptionRole',
				members: () => User,
				// ADR-0339: `indexes` is a RoleSchema option now; `extensions` is not.
				extensions: [],
			} as never),
		).toThrow(new TypeError('Unknown RoleSchema option: extensions'))
	})

	it('compiles canonical FieldBuilder declarations before adding role fields', async () => {
		const BuilderRole = Roles.RoleSchema.define({
			className: 'BuilderRole',
			members: () => User,
			fields: (field) => ({
				description: field.string(),
				priority: field.int({ default: 0 }),
			}),
		})
		const application = new Roles({
			schemas: [User, BuilderRole],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())

		expect(Object.keys(BuilderRole.fields)).toEqual([
			'description',
			'priority',
			'name',
			'members',
			'includedRoles',
			'id',
			'createdAt',
			'updatedAt',
		])

		await application.dispose()
	})

	it('creates one ordinary immutable schema class with generated role fields', () => {
		const AppRole = Roles.RoleSchema.define({
			className: 'AppRole',
			members: () => User,
			fields: (field) => ({
				description: field.string(),
				priority: field.int({ default: 0 }),
			}),
			indexes: [{ fields: ['priority', 'createdAt'] }],
		})

		expect(Schema.is(AppRole)).toBe(true)
		expect(AppRole.fields).toHaveProperty('name')
		expect(AppRole.fields).toHaveProperty('members')
		expect(AppRole.fields).toHaveProperty('includedRoles')
		expect(AppRole.fields).toHaveProperty('description')
		expect(AppRole.indexes).toContainEqual({ fields: ['name'], unique: true })
		expect(AppRole.indexes).toContainEqual({
			fields: ['priority', 'createdAt'],
			unique: false,
		})
		expect(
			Object.hasOwn(AppRole.definition, roleSchemaIdentityOptionName),
		).toBe(true)
		expect(JSON.stringify(AppRole.definition)).not.toContain(
			'transportVisibility',
		)
		expect(new QueryBuilder(AppRole).ast.schema.definition).toBe(AppRole)
		expect(() => construct(AppRole, [{ name: 'editor' }])).toThrow(
			'AppRole is not constructible',
		)
		expect(Object.isFrozen(AppRole)).toBe(true)
		expect(getRoleSchemaDeclaration(AppRole)?.deletionPolicy).toBe('fail')
		expect(getRoleSchemaDeclaration(AppRole)?.memberSchema()).toBe(User)
		expect(AppRole.role('Editor').value).toContain('"name":"editor"')
	})

	it('retains one validated schema-owned reference deletion policy', () => {
		const CascadingRole = Roles.RoleSchema.define({
			className: 'CascadingRole',
			members: () => User,
			deletion: 'cascade',
		})

		expect(getRoleSchemaDeclaration(CascadingRole)?.deletionPolicy).toBe(
			'cascade',
		)
		expect(() =>
			Roles.RoleSchema.define({
				className: 'InvalidDeletionRole',
				members: () => User,
				deletion: 'remove' as unknown as 'fail',
			}),
		).toThrow(
			new TypeError('deletion must be "fail", "preserve", or "cascade"'),
		)
	})

	it('normalizes ensure names and rejects invalid ones', () => {
		const SeededRole = Roles.RoleSchema.define({
			className: 'SeededRole',
			members: () => User,
			ensure: ['Admin', ' admin ', 'Editor'],
		})

		expect(getRoleSchemaDeclaration(SeededRole)?.ensure).toStrictEqual([
			'admin',
			'editor',
		])
		expect(() =>
			Roles.RoleSchema.define({
				className: 'InvalidEnsureRole',
				members: () => User,
				ensure: [' '],
			}),
		).toThrow(new TypeError('role name must not be empty'))
		expect(() =>
			Roles.RoleSchema.define({
				className: 'InvalidEnsureListRole',
				members: () => User,
				ensure: 'admin' as unknown as readonly string[],
			}),
		).toThrow(new TypeError('ensure must be a list of role names'))
	})

	it('rejects generated field collisions with precise diagnostics', () => {
		for (const reserved of ['name', 'members', 'includedRoles']) {
			const fields: Record<string, ReturnType<typeof stringField>> = {
				[reserved]: stringField(),
			}

			expect(() =>
				Roles.RoleSchema.define({
					className: 'InvalidRole',
					members: () => User,
					fields: () => fields,
				}),
			).toThrow(
				expect.objectContaining({
					cause: new TypeError(`Reserved role field: ${reserved}`),
				}),
			)
		}
	})

	it('requires its plugin only when a role schema is registered', async () => {
		const Plain = UltimaBase.Schema.define({
			className: 'PlainRoleFixture',
			fields: () => ({}),
		})
		const plainApplication = new UltimaBase({ schemas: [Plain] })
		await plainApplication.initialize()
		onTestFinished(() => plainApplication.dispose())

		await plainApplication.dispose()

		const AppRole = Roles.RoleSchema.define({
			className: 'OwnedRole',
			members: () => User,
		})
		let infrastructureStarted = false
		const infrastructure = plugin({
			core: '^0.0.0',
			id: 'fixture.roles.missing-plugin-infrastructure',
			contributions: [
				contributeApplication(() => {
					infrastructureStarted = true
					return { exports: undefined }
				}),
			],
			version: '0.0.0',
		})

		await expect(
			new (UltimaBase.use(infrastructure))({
				schemas: [User, AppRole],
			}).initialize(),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
		} satisfies Partial<FrameworkError>)
		expect(infrastructureStarted).toBe(false)
	})

	it('rejects copied and foreign identity values before setup', async () => {
		const OwnedRole = Roles.RoleSchema.define({
			className: 'IdentityOwnerRole',
			members: () => User,
		})
		const identity: unknown = Reflect.get(
			OwnedRole.definition,
			roleSchemaIdentityOptionName,
		)
		const copiedIdentity =
			typeof identity === 'object' && identity !== null
				? { ...identity }
				: identity
		const CopiedRole = UltimaBase.Schema.define({
			className: 'CopiedIdentityRole',
			fields: () => ({}),
		}).with({ [roleSchemaIdentityOptionName]: copiedIdentity } as never)
		const ForeignRole = UltimaBase.Schema.define({
			className: 'ForeignIdentityRole',
			fields: () => ({}),
		}).with({ [roleSchemaIdentityOptionName]: identity } as never)

		for (const [index, schema] of [CopiedRole, ForeignRole].entries()) {
			let infrastructureStarted = false
			const infrastructure = plugin({
				core: '^0.0.0',
				id: `fixture.roles.infrastructure-${String(index)}`,
				contributions: [
					contributeApplication(() => {
						infrastructureStarted = true
						return { exports: undefined }
					}),
				],
				version: '0.0.0',
			})

			await expect(
				new (UltimaBase.use(rolesPlugin(), infrastructure))({
					schemas: [schema],
				}).initialize(),
			).rejects.toMatchObject({ code: 'PLUGIN_DECLARATION_INVALID' })
			expect(infrastructureStarted).toBe(false)
		}
	})

	it('ignores similarly shaped schemas and rejects duplicate role domains', async () => {
		const Similar = UltimaBase.Schema.define({
			className: 'SimilarRoleShape',
			fields: (field) => ({
				members: field.relation({ target: 'RoleUser' }),
				name: field.string(),
				includedRoles: field.relation({ target: 'RoleUser' }),
			}),
		})
		const application = new Roles({
			schemas: [User, Similar],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())
		expect(getRoleSchemaDeclaration(Similar)).toBeUndefined()
		await application.dispose()

		const FirstRole = Roles.RoleSchema.define({
			className: 'DuplicateRoleDomain',
			members: () => User,
		})
		const SecondRole = Roles.RoleSchema.define({
			className: 'DuplicateRoleDomain',
			members: () => User,
		})
		let infrastructureStarted = false
		const infrastructure = plugin({
			core: '^0.0.0',
			id: 'fixture.roles.duplicate-infrastructure',
			contributions: [
				contributeApplication(() => {
					infrastructureStarted = true
					return { exports: undefined }
				}),
			],
			version: '0.0.0',
		})

		await expect(
			Promise.resolve().then(() =>
				new (UltimaBase.use(rolesPlugin(), infrastructure))({
					schemas: [User, FirstRole, SecondRole],
				}).initialize(),
			),
		).rejects.toMatchObject({ code: 'SCHEMA_DUPLICATE_CLASS_NAME' })
		expect(infrastructureStarted).toBe(false)
	})

	it('discovers role domains independently for each application', async () => {
		const SecondUser = UltimaBase.Schema.define({
			className: 'SecondRoleUser',
			fields: (field) => ({ email: field.string() }),
		})
		const FirstRole = Roles.RoleSchema.define({
			className: 'FirstRoleDomain',
			members: () => User,
		})
		const SecondRole = Roles.RoleSchema.define({
			className: 'SecondRoleDomain',
			members: () => SecondUser,
		})
		const firstPlugin = rolesPlugin()
		const secondPlugin = rolesPlugin()
		const first = new (UltimaBase.use(firstPlugin))({
			schemas: [User, FirstRole],
		})
		await first.initialize()
		expect(first.compile().schemas.get(FirstRole.className)).toBe(FirstRole)
		await first.dispose()
		const second = new (UltimaBase.use(secondPlugin))({
			schemas: [SecondUser, SecondRole],
		})
		await second.initialize()
		onTestFinished(() => second.dispose())

		expect(second.compile().schemas.get(SecondRole.className)).toBe(SecondRole)
		expect(getRoleSchemaDeclaration(FirstRole)?.memberSchema()).toBe(User)
		expect(getRoleSchemaDeclaration(SecondRole)?.memberSchema()).toBe(
			SecondUser,
		)
		await Promise.all([first.dispose(), second.dispose()])
	})

	it('allows several role schemas in one application', async () => {
		const TeamRole = Roles.RoleSchema.define({
			className: 'SeveralTeamRole',
			members: () => User,
		})
		const ProjectRole = Roles.RoleSchema.define({
			className: 'SeveralProjectRole',
			members: () => User,
		})
		const application = new Roles({
			schemas: [User, TeamRole, ProjectRole],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())

		expect(getRoleSchemaDeclaration(TeamRole)).toBeDefined()
		expect(getRoleSchemaDeclaration(ProjectRole)).toBeDefined()
		await application.dispose()
	})
})
