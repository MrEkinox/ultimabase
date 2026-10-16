import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { rolesPlugin } from './plugin.js'
import { readRoleSchemaDeclaration } from './role-schema.js'

// ADR-0339: role behaviour is configured by `.with({ roles: { … } })`.

const Roles = UltimaBase.use(rolesPlugin())
const Member = Roles.Schema.define({
	className: 'RuleRoleMember',
	fields: (field) => ({ email: field.string({ required: true }) }),
}).with({})

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
		}).with({
			roles: {
				ensure: ['Lead', ' lead '],
				deletion: 'cascade',
				resolveCurrent,
			},
		})
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

	it('normalizes ensure names and keeps the defaults without the rule', () => {
		const Seeded = Roles.RoleSchema.define({
			className: 'RuleSeededRole',
			members: () => Member,
		}).with({ roles: { ensure: ['Admin', ' admin ', 'Editor'] } })
		const Plain = Roles.RoleSchema.define({
			className: 'RulePlainRole',
			members: () => Member,
		}).with({})
		const plain = readRoleSchemaDeclaration(
			compiledRole(Plain, 'RulePlainRole'),
		)

		expect(
			readRoleSchemaDeclaration(compiledRole(Seeded, 'RuleSeededRole'))?.ensure,
		).toStrictEqual(['admin', 'editor'])
		expect(plain?.ensure).toStrictEqual([])
		expect(plain?.deletionPolicy).toBe('fail')
		expect(plain?.resolveCurrent).toBeUndefined()
	})

	it('validates the rule and applies it to role schemas only', () => {
		const invalid = (className: string, rule: unknown) =>
			Roles.RoleSchema.define({
				className,
				members: () => Member,
			}).with({ roles: rule as never })
		const Invalid = invalid('RuleInvalidRole', { deletion: 'remove' })
		const NotRole = Roles.Schema.define({
			className: 'RuleNotRole',
			fields: (field) => ({ title: field.string() }),
		}).with({
			// @ts-expect-error -- `roles` is a rule of role schemas only.
			roles: { ensure: ['x'] },
		})

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
		expect(
			messagesOf(() =>
				compiledRole(
					invalid('RuleEmptyNameRole', { ensure: [' '] }),
					'RuleEmptyNameRole',
				),
			),
		).toContain('role name must not be empty')
		expect(
			messagesOf(() =>
				compiledRole(
					invalid('RuleEnsureListRole', { ensure: 'admin' }),
					'RuleEnsureListRole',
				),
			),
		).toContain('ensure must be a list of role names')
		expect(
			messagesOf(() =>
				compiledRole(
					invalid('RuleResolverRole', { resolveCurrent: 'self' }),
					'RuleResolverRole',
				),
			),
		).toContain('RuleResolverRole.roles.resolveCurrent must be a function')
	})
})
