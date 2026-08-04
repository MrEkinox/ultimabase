import { describe, expect, it } from 'vitest'

import { Schema } from '../../schema/schema/definition.js'
import {
	createTrustedMasterRequestContext,
	RequestContext,
} from '../../runtime/context/request-context.js'
import { RequestContextValue } from '../request/context-value.js'
import {
	AccessSubjectReference,
	resolveAccessPrincipal,
	resolveAccessRoleReference,
} from './contracts.js'

const Principal = Schema.define({ className: 'AccessPrincipal', fields: {} })
const ForeignPrincipal = Schema.define({
	className: 'AccessPrincipal',
	fields: {},
})
const principal = Principal.pointer('principal-id')
const principalValue = new RequestContextValue<string>(
	'fixture.auth.operator',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture operator must be a string')
		}

		return value
	},
)

describe('AccessSubjectReference', () => {
	it('retains one immutable provider-neutral subject reference', () => {
		const reference = new AccessSubjectReference('role', 'editor')

		expect(reference).toEqual({ kind: 'role', value: 'editor' })
		expect(Object.isFrozen(reference)).toBe(true)
	})

	it('rejects empty or untrusted subject kinds', () => {
		expect(() => new AccessSubjectReference('', 'editor')).toThrow(
			new TypeError('Access subject kind must be a non-empty string'),
		)
		expect(
			() =>
				new AccessSubjectReference(
					// @ts-expect-error -- Runtime validation protects JavaScript callers.
					42,
					'editor',
				),
		).toThrow(new TypeError('Access subject kind must be a non-empty string'))
	})
})

describe('resolveAccessRoleReference', () => {
	it('accepts direct references and neutral persisted-value carriers', () => {
		const reference = new AccessSubjectReference('role', 'editor')

		expect(resolveAccessRoleReference(reference)).toBe(reference)
		expect(
			resolveAccessRoleReference({
				toAccessRoleReference: () => reference,
			}),
		).toBe(reference)
	})

	it('rejects forged carriers and non-string role identities', () => {
		expect(() =>
			resolveAccessRoleReference({
				toAccessRoleReference: () =>
					new AccessSubjectReference('principal', 'editor') as never,
			}),
		).toThrow(
			new TypeError(
				'Access role subject must provide one string role reference',
			),
		)
		expect(() =>
			resolveAccessRoleReference(
				new AccessSubjectReference('role', 42) as never,
			),
		).toThrow(
			new TypeError(
				'Access role subject must provide one string role reference',
			),
		)
	})
})

describe('resolveAccessPrincipal', () => {
	const anonymous = RequestContext.anonymous({
		requestId: 'access-principal',
		source: 'unit',
	})
	const ownsPrincipalSchema = (schema: unknown): boolean => schema === Principal

	it('keeps absent providers and absent identities fail-closed', async () => {
		await expect(
			resolveAccessPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: undefined,
			}),
		).resolves.toBeUndefined()
		await expect(
			resolveAccessPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: { resolveCurrent: () => Promise.resolve(undefined) },
			}),
		).resolves.toBeUndefined()
	})

	it('returns one exact application-owned Core Pointer', async () => {
		await expect(
			resolveAccessPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: { resolveCurrent: () => principal },
			}),
		).resolves.toBe(principal)
	})

	it('rejects malformed and foreign-application Pointer results', async () => {
		await expect(
			resolveAccessPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: { resolveCurrent: () => ({ id: 'forged' }) as never },
			}),
		).rejects.toThrow(
			new TypeError('Access principal resolver must return a Core Pointer'),
		)
		await expect(
			resolveAccessPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: {
					resolveCurrent: () => ForeignPrincipal.pointer('principal-id'),
				},
			}),
		).rejects.toThrow(
			new TypeError(
				'Access principal resolver returned a foreign application schema',
			),
		)
	})

	it('passes master authority and plugin-owned values through unchanged', async () => {
		const base = anonymous.withValue(principalValue, 'operator-id')
		const master = createTrustedMasterRequestContext(
			'audit ACL repair',
			'maintenance',
			base,
		)

		await expect(
			resolveAccessPrincipal({
				context: master,
				ownsSchema: ownsPrincipalSchema,
				resolver: {
					resolveCurrent: ({ context }) => {
						expect(context.access.mode).toBe('master')
						expect(context.getValue(principalValue)).toBe('operator-id')

						return principal
					},
				},
			}),
		).resolves.toBe(principal)
	})
})
