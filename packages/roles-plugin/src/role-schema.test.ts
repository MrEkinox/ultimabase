import { onTestFinished, describe, expect, it } from 'vitest'
import {
	QueryBuilder,
	Schema,
	UltimaBase,
	plugin,
	contributeApplication,
	stringField,
	type SchemaOptions,
} from '@ultimabase/core'
import type { FrameworkError } from '@ultimabase/core'

import { rolesPlugin } from './plugin.js'
import { getRoleSchemaDeclaration, RoleSchema } from './role-schema.js'
import { roleSchemaIdentityOptionName } from './role-schema-identity.js'

const User = Schema.define({
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
		const draft = new ConfiguredRole({ name: 'draft' })
		const toRequestRoleReference: unknown = Reflect.get(
			draft,
			'toRequestRoleReference',
		)
		if (typeof toRequestRoleReference !== 'function') {
			throw new TypeError(
				'Configured RoleSchema must expose toRequestRoleReference at runtime',
			)
		}
		expect(() => {
			Reflect.apply(toRequestRoleReference, draft, [])
		}).toThrow(
			new TypeError(
				'Schema model toRequestRoleReference requires persisted model state',
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
		const application = new UltimaBase({
			schemas: [User, BuilderRole],
			plugins: [rolesPlugin()],
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
		const plainApplication = new UltimaBase({
			schemas: [Plain],
			plugins: [],
		})
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
			new UltimaBase({
				schemas: [User, AppRole],
				plugins: [infrastructure],
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
				new UltimaBase({
					plugins: [rolesPlugin(), infrastructure],
					schemas: [schema],
				}).initialize(),
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
		const application = new UltimaBase({
			plugins: [rolesPlugin()],
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
				new UltimaBase({
					plugins: [rolesPlugin(), infrastructure],
					schemas: [User, FirstRole, SecondRole],
				}).initialize(),
			),
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
		const first = new UltimaBase({
			schemas: [User, FirstRole],
			plugins: [firstPlugin] as const,
		})
		await first.initialize()
		expect(first.compile().schemas.get(FirstRole.className)).toBe(FirstRole)
		await first.dispose()
		const second = new UltimaBase({
			schemas: [SecondUser, SecondRole],
			plugins: [secondPlugin] as const,
		})
		await second.initialize()
		onTestFinished(() => second.dispose())

		expect(second.compile().schemas.get(SecondRole.className)).toBe(SecondRole)
		expect(getRoleSchemaDeclaration(FirstRole)?.memberSchema).toBe(User)
		expect(getRoleSchemaDeclaration(SecondRole)?.memberSchema).toBe(SecondUser)
		await Promise.all([first.dispose(), second.dispose()])
	})
})
