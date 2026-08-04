import {
	Query,
	Schema,
	createApplication,
	intField,
	stringField,
} from '@ultimabase/core'
import type { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { rolesPlugin } from './plugin.js'
import {
	RoleSchema,
	roleSchemaExtensionName,
	rolesPluginName,
} from './role-schema.js'

const User = Schema.define({
	className: 'RoleUser',
	fields: { email: stringField({ validation: { required: true } }) },
})

describe('RoleSchema', () => {
	it('creates one ordinary immutable schema class with generated role fields', () => {
		const AppRole = RoleSchema.define({
			className: 'AppRole',
			members: { schema: User },
			fields: { description: stringField(), priority: intField({ default: 0 }) },
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
		expect(AppRole.extensions.at(-1)?.name).toBe(roleSchemaExtensionName)
		expect(new Query(AppRole).ast.schema.definition).toBe(AppRole)
		expect(AppRole.query().ast.schema.definition).toBe(AppRole)
		expect(draft.name).toBe('editor')
		expect(Object.isFrozen(draft)).toBe(true)
		expect(Object.isFrozen(AppRole)).toBe(true)
	})

	it('rejects generated field collisions with precise diagnostics', () => {
		const fields: Record<string, ReturnType<typeof stringField>> = {
			name: stringField(),
		}

		expect(() =>
			RoleSchema.define({
				className: 'InvalidRole',
				members: { schema: User },
				fields,
			}),
		).toThrow(new TypeError('Reserved role field: name'))
	})

	it('requires its plugin only when a role schema is registered', async () => {
		const Plain = Schema.define({ className: 'PlainRoleFixture', fields: {} })
		const plainApplication = await createApplication({
			schemas: [Plain],
			plugins: [],
		})

		await plainApplication.dispose()

		const AppRole = RoleSchema.define({
			className: 'OwnedRole',
			members: { schema: User },
			fields: {},
		})

		await expect(
			createApplication({ schemas: [User, AppRole], plugins: [] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_EXTENSION_HANDLER_MISSING',
		} satisfies Partial<FrameworkError>)
	})

	it('discovers role domains independently for each application', async () => {
		const FirstRole = RoleSchema.define({
			className: 'FirstRoleDomain',
			members: { schema: User },
			fields: {},
		})
		const SecondRole = RoleSchema.define({
			className: 'SecondRoleDomain',
			members: { schema: User },
			fields: {},
		})
		const firstPlugin = rolesPlugin()
		const secondPlugin = rolesPlugin()
		const [first, second] = await Promise.all([
			createApplication({
				schemas: [User, FirstRole],
				plugins: [firstPlugin] as const,
			}),
			createApplication({
				schemas: [User, SecondRole],
				plugins: [secondPlugin] as const,
			}),
		])

		expect(first.getPlugin(rolesPluginName).schemas).toStrictEqual([FirstRole])
		expect(second.getPlugin(rolesPluginName).schemas).toStrictEqual([SecondRole])
		expect(first.getPlugin(rolesPluginName).schemas).not.toBe(
			second.getPlugin(rolesPluginName).schemas,
		)

		await Promise.all([first.dispose(), second.dispose()])
	})
})
