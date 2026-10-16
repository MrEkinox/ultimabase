import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { rolesPlugin } from './plugin.js'
import { readRoleSchemaDeclaration } from './role-schema.js'

// ADR-0339: role behaviour moves to `.with((plugins) => plugins.roles({ … }))`;
// the define options keep working until the old forms are removed.
const Roles = UltimaBase.use(rolesPlugin())
const Member = Roles.Schema.define({
	className: 'RuleRoleMember',
	fields: (field) => ({ email: field.string({ required: true }) }),
}).with((plugins) => plugins)

const compiledRole = (
	role: SchemaDefinition,
	className: string,
): SchemaDefinition => {
	const compiled = new Roles({
		logger: false,
		schemas: [Member, role] as never,
	}).compile()
	const schema = compiled.schemas.get(className)
	if (schema === undefined) throw new TypeError(`Missing ${className}`)
	return schema
}

describe('plugins.roles (ADR-0339)', () => {
	it('configures ensure, deletion and resolveCurrent in .with', () => {
		const resolveCurrent = () => undefined
		const Role = Roles.RoleSchema.define({
			className: 'RuleConfiguredRole',
			members: () => Member,
			indexes: [{ fields: ['name', 'createdAt'] }],
		}).with((plugins) =>
			plugins.roles({
				ensure: ['Lead', ' lead '],
				deletion: 'cascade',
				resolveCurrent,
			}),
		)
		const declaration = readRoleSchemaDeclaration(
			compiledRole(Role, 'RuleConfiguredRole'),
		)

		expect(declaration?.ensure).toStrictEqual(['lead'])
		expect(declaration?.deletionPolicy).toBe('cascade')
		expect(declaration?.resolveCurrent).toBe(resolveCurrent)
		expect(Role.indexes).toContainEqual({
			fields: ['name', 'createdAt'],
			unique: false,
		})
	})

	it('keeps the define options and rejects one set in both places', () => {
		const Legacy = Roles.RoleSchema.define({
			className: 'RuleLegacyRole',
			members: () => Member,
			ensure: ['admin'],
		}).with((plugins) => plugins)
		const Repeated = Roles.RoleSchema.define({
			className: 'RuleRepeatedRole',
			members: () => Member,
			deletion: 'fail',
		}).with((plugins) => plugins.roles({ deletion: 'preserve' }))

		expect(
			readRoleSchemaDeclaration(compiledRole(Legacy, 'RuleLegacyRole'))?.ensure,
		).toStrictEqual(['admin'])
		expect(() =>
			readRoleSchemaDeclaration(compiledRole(Repeated, 'RuleRepeatedRole')),
		).toThrow(
			new TypeError(
				'RuleRepeatedRole sets deletion both in define() and in plugins.roles({ … }); keep it in .with((plugins) => plugins.roles({ … }))',
			),
		)
	})

	it('validates the rule and applies it to role schemas only', () => {
		const Invalid = Roles.RoleSchema.define({
			className: 'RuleInvalidRole',
			members: () => Member,
		}).with((plugins) => plugins.roles({ deletion: 'remove' } as never))
		const NotRole = Roles.Schema.define({
			className: 'RuleNotRole',
			fields: (field) => ({ title: field.string() }),
		}).with({ roles: { ensure: ['x'] } } as never)

		// The application wraps option errors; the rule's message is a cause.
		const messagesOf = (run: () => unknown): readonly string[] => {
			try {
				run()
			} catch (error: unknown) {
				const messages: string[] = []
				for (
					let cause: unknown = error;
					cause instanceof Error;
					cause = cause.cause
				) {
					messages.push(cause.message)
				}
				return messages
			}
			return []
		}

		expect(
			messagesOf(() => compiledRole(Invalid, 'RuleInvalidRole')),
		).toContain('deletion must be "fail", "preserve", or "cascade"')
		expect(messagesOf(() => compiledRole(NotRole, 'RuleNotRole'))).toContain(
			'RuleNotRole.roles applies only to schemas declared by App.RoleSchema.define',
		)
	})
})
