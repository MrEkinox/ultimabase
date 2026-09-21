import {
	RequestSubjectReference,
	Pointer,
	QueryBuilder,
	Schema,
	type RequestSubjectContext,
	type RequestPrincipalResolver,
	type RequestRoleResolver,
	type SchemaDefinition,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import { ACL } from './acl.js'
import {
	createACLPermissionRowFilter,
	requiredACLPermission,
	resolveACLAccessSubjects,
} from './acl-access.js'

const Principal = Schema.define({
	className: 'ACLAccessPrincipal',
	fields: (field) => ({ name: field.string() }),
})
const ProtectedRecord = Schema.define({
	className: 'ACLAccessProtectedRecord',
	fields: (field) => ({ name: field.string() }),
})
const principal = new Pointer(Principal, '0198a43e-2431-7000-8000-000000000011')
const context: RequestSubjectContext = {
	access: { mode: 'anonymous' },
	getValue: () => undefined,
	hasCapability: () => false,
	requestId: 'acl-access-test',
	signal: new AbortController().signal,
	source: 'test',
}
const ownsPrincipalSchema = (schema: SchemaDefinition): boolean =>
	schema === Principal

describe('ACL Access contributions', () => {
	it('normalizes one principal and unique role set into portable row alternatives', async () => {
		const editor = new RequestSubjectReference('role', 'role:editor')
		const principalResolver: RequestPrincipalResolver = {
			resolveCurrent: vi.fn(() => principal),
		}
		const roleResolver: RequestRoleResolver = {
			hasRole: () => false,
			resolveCurrentRoles: vi.fn(() => [editor, editor]),
		}
		const subjects = await resolveACLAccessSubjects(
			context,
			principalResolver,
			roleResolver,
			ownsPrincipalSchema,
		)

		expect(subjects).toStrictEqual({
			principal,
			roleResolutionAvailable: true,
			roles: [editor],
		})
		expect(createACLPermissionRowFilter('update', subjects)).toStrictEqual({
			expressions: [
				{ field: 'acl', kind: 'contains', value: { public: ['update'] } },
				{
					field: 'acl',
					kind: 'contains',
					value: { authenticated: ['update'] },
				},
				{
					field: 'acl',
					kind: 'contains',
					value: {
						principals: [
							{
								className: Principal.className,
								id: principal.id,
								permissions: ['update'],
							},
						],
					},
				},
				{
					field: 'acl',
					kind: 'contains',
					value: {
						roles: [
							{
								kind: 'role',
								permissions: ['update'],
								value: 'role:editor',
							},
						],
					},
				},
			],
			kind: 'or',
		})
		expect(Object.isFrozen(subjects.roles)).toBe(true)
	})

	it('rejects malformed or foreign identities before they reach an adapter', async () => {
		await expect(
			resolveACLAccessSubjects(
				context,
				{ resolveCurrent: () => ({ id: principal.id }) as never },
				undefined,
				ownsPrincipalSchema,
			),
		).rejects.toThrow('must return a Core Pointer')

		await expect(
			resolveACLAccessSubjects(
				context,
				undefined,
				{
					hasRole: () => false,
					resolveCurrentRoles: () => [
						new RequestSubjectReference('group', 'editors') as never,
					],
				},
				ownsPrincipalSchema,
			),
		).rejects.toThrow('invalid reference at index 0')
	})

	it('maps terminals to monotonic rights and detects ACL replacement', () => {
		const schema = new QueryBuilder(ProtectedRecord).ast.schema
		const query = new QueryBuilder(ProtectedRecord).ast
		const aclUpdate = {
			kind: 'update-expression',
			operations: [{ field: 'acl', kind: 'set', value: new ACL() }],
		} as const

		expect(requiredACLPermission({ kind: 'find-many', query })).toBe('read')
		expect(requiredACLPermission({ kind: 'delete-one', query })).toBe('delete')
		expect(
			requiredACLPermission({
				kind: 'update-one',
				query,
				update: aclUpdate,
			}),
		).toBe('update')
		expect(
			requiredACLPermission({
				input: { name: 'created' },
				kind: 'create-one',
				selection: { fields: [], kind: 'selection' },
				schema,
			}),
		).toBeUndefined()
	})
})
