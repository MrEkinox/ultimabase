import {
	QueryBuilder,
	Schema,
	createApplication,
	definePlugin,
	stringField,
	type SchemaOptions,
} from '@ultimabase/core'
import type { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { rolesPlugin } from './plugin.js'
import {
	getRoleSchemaDeclaration,
	RoleSchema,
	rolesPluginName,
	type RoleSchemaOptions,
} from './role-schema.js'
import { roleSchemaIdentityOptionName } from './role-schema-identity.js'

const User = Schema.define({
	className: 'RoleUser',
	fields: (field) => ({
		email: field.string({ validation: { required: true } }),
	}),
})

describe('RoleSchema', () => {
	it('compiles canonical FieldBuilder declarations before adding role fields', async () => {
		const BuilderRole = RoleSchema.define({
			className: 'BuilderRole',
			members: { schema: User },
			fields: (field) => ({
				description: field.string(),
				priority: field.int({ default: 0 }),
			}),
		})
		const application = await createApplication({
			schemas: [User, BuilderRole],
			plugins: [rolesPlugin()],
		})

		expect(Object.keys(BuilderRole.fields)).toEqual([
			'description',
			'priority',
			'name',
			'members',
			'roles',
			'id',
			'createdAt',
			'updatedAt',
		])

		await application.dispose()
	})

	it('creates one ordinary immutable schema class with generated role fields', () => {
		const AppRole = RoleSchema.define({
			className: 'AppRole',
			members: { schema: User },
			fields: (field) => ({
				description: field.string(),
				priority: field.int({ default: 0 }),
			}),
			indexes: [{ fields: ['priority', 'createdAt'] }],
		})
		const draft = new AppRole({ name: 'editor', description: 'Editors' })

		expect(Schema.is(AppRole)).toBe(true)
		expect(AppRole.fields).toHaveProperty('name')
		expect(AppRole.fields).toHaveProperty('members')
		expect(AppRole.fields).toHaveProperty('roles')
		expect(AppRole.fields).toHaveProperty('description')
		expect(AppRole.indexes).toContainEqual({ fields: ['name'], unique: true })
		expect(AppRole.indexes).toContainEqual({
			fields: ['priority', 'createdAt'],
			unique: false,
		})
		expect(AppRole.extensions).toStrictEqual([])
		expect(
			Object.hasOwn(AppRole.definition, roleSchemaIdentityOptionName),
		).toBe(true)
		expect(JSON.stringify(AppRole.definition)).not.toContain(
			'transportVisibility',
		)
		expect(new QueryBuilder(AppRole).ast.schema.definition).toBe(AppRole)
		expect(new QueryBuilder(AppRole).ast.schema.definition).toBe(AppRole)
		expect(draft.name).toBe('editor')
		expect(Object.isFrozen(draft)).toBe(true)
		expect(Object.isFrozen(AppRole)).toBe(true)
		expect(getRoleSchemaDeclaration(AppRole)?.deletionPolicy).toBe('fail')
	})

	it('retains one validated schema-owned reference deletion policy', () => {
		const CascadingRole = RoleSchema.define({
			className: 'CascadingRole',
			members: { schema: User },
			fields: () => ({}),
			deletion: { references: 'cascade' },
		})

		expect(getRoleSchemaDeclaration(CascadingRole)?.deletionPolicy).toBe(
			'cascade',
		)
		expect(() =>
			RoleSchema.define({
				className: 'InvalidDeletionRole',
				members: { schema: User },
				fields: () => ({}),
				deletion: {
					references: 'remove' as unknown as 'fail',
				},
			}),
		).toThrow(
			new TypeError(
				'deletion.references must be "fail", "preserve", or "cascade"',
			),
		)
	})

	it('rejects generated field collisions with precise diagnostics', () => {
		const fields: Record<string, ReturnType<typeof stringField>> = {
			name: stringField(),
		}

		expect(() =>
			RoleSchema.define({
				className: 'InvalidRole',
				members: { schema: User },
				fields: () => fields,
			}),
		).toThrow(
			expect.objectContaining({
				cause: new TypeError('Reserved role field: name'),
			}),
		)
	})

	it('requires its plugin only when a role schema is registered', async () => {
		const Plain = Schema.define({
			className: 'PlainRoleFixture',
			fields: () => ({}),
		})
		const plainApplication = await createApplication({
			schemas: [Plain],
			plugins: [],
		})

		await plainApplication.dispose()

		const AppRole = RoleSchema.define({
			className: 'OwnedRole',
			members: { schema: User },
			fields: () => ({}),
		})
		let infrastructureStarted = false
		const infrastructure = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.roles.missing-plugin-infrastructure',
			setup: () => {
				infrastructureStarted = true
			},
			version: '0.0.0',
		})

		await expect(
			createApplication({
				schemas: [User, AppRole],
				plugins: [infrastructure],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
		} satisfies Partial<FrameworkError>)
		expect(infrastructureStarted).toBe(false)
	})

	it('rejects legacy RoleSchema extensions at the declaration boundary', () => {
		expect(() =>
			RoleSchema.define({
				className: 'LegacyExtendedRole',
				members: { schema: User },
				fields: () => ({}),
				extensions: [],
			} as RoleSchemaOptions<'LegacyExtendedRole', typeof User> & {
				readonly extensions: readonly []
			}),
		).toThrow(
			'RoleSchema extensions are not supported; use direct plugin options',
		)
	})

	it('rejects copied and foreign identity values before setup', async () => {
		const OwnedRole = RoleSchema.define({
			className: 'IdentityOwnerRole',
			members: { schema: User },
			fields: () => ({}),
		})
		const identity: unknown = Reflect.get(
			OwnedRole.definition,
			roleSchemaIdentityOptionName,
		)
		const copiedIdentity =
			typeof identity === 'object' && identity !== null
				? { ...identity }
				: identity
		const CopiedRole = Schema.define({
			className: 'CopiedIdentityRole',
			fields: () => ({}),
			[roleSchemaIdentityOptionName]: copiedIdentity,
		} as SchemaOptions<'CopiedIdentityRole'> &
			Readonly<Record<typeof roleSchemaIdentityOptionName, unknown>>)
		const ForeignRole = Schema.define({
			className: 'ForeignIdentityRole',
			fields: () => ({}),
			[roleSchemaIdentityOptionName]: identity,
		} as SchemaOptions<'ForeignIdentityRole'> &
			Readonly<Record<typeof roleSchemaIdentityOptionName, unknown>>)

		for (const [index, schema] of [CopiedRole, ForeignRole].entries()) {
			let infrastructureStarted = false
			const infrastructure = definePlugin({
				core: '^0.0.0',
				pluginId: `fixture.roles.infrastructure-${String(index)}`,
				setup: () => {
					infrastructureStarted = true
				},
				version: '0.0.0',
			})

			await expect(
				createApplication({
					plugins: [rolesPlugin(), infrastructure],
					schemas: [schema],
				}),
			).rejects.toMatchObject({ code: 'PLUGIN_DECLARATION_INVALID' })
			expect(infrastructureStarted).toBe(false)
		}
	})

	it('ignores similarly shaped schemas and rejects duplicate role domains', async () => {
		const Similar = Schema.define({
			className: 'SimilarRoleShape',
			fields: (field) => ({
				members: field.relation({ target: 'RoleUser' }),
				name: field.string(),
				roles: field.relation({ target: 'RoleUser' }),
			}),
		})
		const application = await createApplication({
			plugins: [rolesPlugin()],
			schemas: [User, Similar],
		})
		expect(application.getPlugin(rolesPluginName).schemas).toStrictEqual([])
		await application.dispose()

		const FirstRole = RoleSchema.define({
			className: 'DuplicateRoleDomain',
			members: { schema: User },
			fields: () => ({}),
		})
		const SecondRole = RoleSchema.define({
			className: 'DuplicateRoleDomain',
			members: { schema: User },
			fields: () => ({}),
		})
		let infrastructureStarted = false
		const infrastructure = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.roles.duplicate-infrastructure',
			setup: () => {
				infrastructureStarted = true
			},
			version: '0.0.0',
		})

		await expect(
			createApplication({
				plugins: [rolesPlugin(), infrastructure],
				schemas: [User, FirstRole, SecondRole],
			}),
		).rejects.toMatchObject({ code: 'SCHEMA_DUPLICATE_CLASS_NAME' })
		expect(infrastructureStarted).toBe(false)
	})

	it('discovers role domains independently for each application', async () => {
		const SecondUser = Schema.define({
			className: 'SecondRoleUser',
			fields: (field) => ({ email: field.string() }),
		})
		const FirstRole = RoleSchema.define({
			className: 'FirstRoleDomain',
			members: { schema: User },
			fields: () => ({}),
		})
		const SecondRole = RoleSchema.define({
			className: 'SecondRoleDomain',
			members: { schema: SecondUser },
			fields: () => ({}),
		})
		const firstPlugin = rolesPlugin()
		const secondPlugin = rolesPlugin()
		const [first, second] = await Promise.all([
			createApplication({
				schemas: [User, FirstRole],
				plugins: [firstPlugin] as const,
			}),
			createApplication({
				schemas: [SecondUser, SecondRole],
				plugins: [secondPlugin] as const,
			}),
		])

		expect(first.getPlugin(rolesPluginName).schemas).toStrictEqual([FirstRole])
		expect(second.getPlugin(rolesPluginName).schemas).toStrictEqual([
			SecondRole,
		])
		expect(first.getPlugin(rolesPluginName).schemas).not.toBe(
			second.getPlugin(rolesPluginName).schemas,
		)
		expect(getRoleSchemaDeclaration(FirstRole)?.memberSchema).toBe(User)
		expect(getRoleSchemaDeclaration(SecondRole)?.memberSchema).toBe(SecondUser)
		await Promise.all([first.dispose(), second.dispose()])
	})
})
