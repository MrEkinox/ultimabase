import { onTestFinished, describe, expect, it } from 'vitest'
import {
	Schema,
	UltimaBase,
	plugin,
	contributeApplication,
	stringField,
} from '@ultimabase/core'
import type { FrameworkError } from '@ultimabase/core'

import { rolesPlugin } from './plugin.js'
import { getRoleSchemaDeclaration, RoleSchema } from './role-schema.js'
import { roleSchemaIdentityOptionName } from './role-schema-identity.js'
import { QueryBuilder } from '@ultimabase/core/plugin'

/** Calls `new` on a value whose type has no construct signature (ADR-0310). */
const construct = (target: unknown, args: readonly unknown[]): unknown => {
	if (typeof target !== 'function') throw new TypeError('Expected a class')
	return Reflect.construct(target, args)
}

const User = UltimaBase.Schema.define({
	className: 'RoleUser',
	fields: (field) => ({
		email: field.string({ required: true }),
	}),
})

describe('RoleSchema', () => {
	it('accepts only the configured application Schema namespace', () => {
		const Application = UltimaBase.use(rolesPlugin())
		const ConfiguredRole = RoleSchema.define(Application.Schema, {
			className: 'ConfiguredRole',
			members: { schema: User },
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
			RoleSchema.define(
				Object.freeze({}) as unknown as typeof Application.Schema,
				{
					className: 'InvalidConfiguredRole',
					members: { schema: User },
					fields: () => ({}),
				},
			),
		).toThrow(
			new TypeError(
				'RoleSchema configured declarations require an UltimaBase Schema namespace',
			),
		)
		expect(() =>
			RoleSchema.define(Schema as unknown as typeof Application.Schema, {
				className: 'BareClassRole',
				members: { schema: User },
				fields: () => ({}),
			}),
		).toThrow(
			new TypeError(
				'RoleSchema configured declarations require an UltimaBase Schema namespace',
			),
		)
	})

	it('compiles canonical FieldBuilder declarations before adding role fields', async () => {
		const BuilderRole = RoleSchema.define({
			className: 'BuilderRole',
			members: { schema: User },
			fields: (field) => ({
				description: field.string(),
				priority: field.int({ default: 0 }),
			}),
		})
		const application = new (UltimaBase.use(rolesPlugin()))({
			schemas: [User, BuilderRole],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())

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
		expect(
			Object.hasOwn(AppRole.definition, roleSchemaIdentityOptionName),
		).toBe(true)
		expect(JSON.stringify(AppRole.definition)).not.toContain(
			'transportVisibility',
		)
		expect(new QueryBuilder(AppRole).ast.schema.definition).toBe(AppRole)
		expect(new QueryBuilder(AppRole).ast.schema.definition).toBe(AppRole)
		expect(() => construct(AppRole, [{ name: 'editor' }])).toThrow(
			'AppRole is not constructible',
		)
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
		const Plain = UltimaBase.Schema.define({
			className: 'PlainRoleFixture',
			fields: () => ({}),
		})
		const plainApplication = new UltimaBase({ schemas: [Plain] })
		await plainApplication.initialize()
		onTestFinished(() => plainApplication.dispose())

		await plainApplication.dispose()

		const AppRole = RoleSchema.define({
			className: 'OwnedRole',
			members: { schema: User },
			fields: () => ({}),
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
		const CopiedRole = UltimaBase.Schema.define({
			className: 'CopiedIdentityRole',
			fields: () => ({}),
			[roleSchemaIdentityOptionName]: copiedIdentity,
		} as never)
		const ForeignRole = UltimaBase.Schema.define({
			className: 'ForeignIdentityRole',
			fields: () => ({}),
			[roleSchemaIdentityOptionName]: identity,
		} as never)

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
				roles: field.relation({ target: 'RoleUser' }),
			}),
		})
		const application = new (UltimaBase.use(rolesPlugin()))({
			schemas: [User, Similar],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())
		expect(getRoleSchemaDeclaration(Similar)).toBeUndefined()
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
		expect(getRoleSchemaDeclaration(FirstRole)?.memberSchema).toBe(User)
		expect(getRoleSchemaDeclaration(SecondRole)?.memberSchema).toBe(SecondUser)
		await Promise.all([first.dispose(), second.dispose()])
	})
})
