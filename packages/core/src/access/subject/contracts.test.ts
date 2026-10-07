import { describe, expect, it } from 'vitest'

import { RequestContext } from '../../runtime/context/request-context.js'
import { createFixtureMasterContext } from '../../../tests/fixtures/master-context.js'
import { RequestContextValue } from '../request/context-value.js'
import {
	RequestSubjectReference,
	createRequestPrincipalReference,
	parseRequestPrincipalReference,
	resolveRequestPrincipal,
	resolveRequestRoleReference,
} from './contracts.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Principal = UltimaBase.Schema.define({
	className: 'AccessPrincipal',
	fields: () => ({}),
})
const ForeignPrincipal = UltimaBase.Schema.define({
	className: 'AccessPrincipal',
	fields: () => ({}),
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

describe('RequestSubjectReference', () => {
	it('retains one immutable provider-neutral subject reference', () => {
		const reference = new RequestSubjectReference('role', 'editor')

		expect(reference).toEqual({ kind: 'role', value: 'editor' })
		expect(Object.isFrozen(reference)).toBe(true)
	})

	it('rejects empty or untrusted subject kinds', () => {
		expect(() => new RequestSubjectReference('', 'editor')).toThrow(
			new TypeError('Request subject kind must be a non-empty string'),
		)
		expect(
			() =>
				new RequestSubjectReference(
					// @ts-expect-error -- Runtime validation protects JavaScript callers.
					42,
					'editor',
				),
		).toThrow(new TypeError('Request subject kind must be a non-empty string'))
	})
})

describe('Request principal references', () => {
	it('round-trips one schema-qualified principal without retaining its schema', () => {
		const reference = createRequestPrincipalReference(principal)

		expect(reference.kind).toBe('principal')
		expect(parseRequestPrincipalReference(reference)).toStrictEqual({
			className: Principal.className,
			id: principal.id,
		})
		expect(Object.isFrozen(parseRequestPrincipalReference(reference))).toBe(
			true,
		)
	})

	it('rejects forged pointers and malformed neutral values', () => {
		expect(() => createRequestPrincipalReference({} as never)).toThrow(
			'Request principal reference requires a Core Pointer',
		)
		expect(() =>
			parseRequestPrincipalReference(
				new RequestSubjectReference('role', 'invalid') as never,
			),
		).toThrow('Request principal reference is invalid')
	})

	it.each([
		'invalid',
		'{}',
		JSON.stringify(['@ultimabase/core', 1, 'Principal']),
		JSON.stringify(['foreign', 1, 'Principal', 'principal-1']),
		JSON.stringify(['@ultimabase/core', 2, 'Principal', 'principal-1']),
		JSON.stringify(['@ultimabase/core', 1, '', 'principal-1']),
		JSON.stringify(['@ultimabase/core', 1, 'Principal', '']),
	])('rejects malformed neutral principal value %s', (value) => {
		expect(() =>
			parseRequestPrincipalReference(
				new RequestSubjectReference('principal', value),
			),
		).toThrow()
	})
})

describe('resolveRequestRoleReference', () => {
	it('accepts direct references and neutral persisted-value carriers', () => {
		const reference = new RequestSubjectReference('role', 'editor')

		expect(resolveRequestRoleReference(reference)).toBe(reference)
		expect(
			resolveRequestRoleReference({
				toRequestRoleReference: () => reference,
			}),
		).toBe(reference)
	})

	it('rejects forged carriers and non-string role identities', () => {
		expect(() =>
			resolveRequestRoleReference({
				toRequestRoleReference: () =>
					new RequestSubjectReference('principal', 'editor') as never,
			}),
		).toThrow(
			new TypeError(
				'Request role subject must provide one string role reference',
			),
		)
		expect(() =>
			resolveRequestRoleReference(
				new RequestSubjectReference('role', 42) as never,
			),
		).toThrow(
			new TypeError(
				'Request role subject must provide one string role reference',
			),
		)
	})
})

describe('resolveRequestPrincipal', () => {
	const anonymous = RequestContext.anonymous({
		requestId: 'access-principal',
		source: 'unit',
	})
	const ownsPrincipalSchema = (schema: unknown): boolean => schema === Principal

	it('keeps absent providers and absent identities fail-closed', async () => {
		await expect(
			resolveRequestPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: undefined,
			}),
		).resolves.toBeUndefined()
		await expect(
			resolveRequestPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: { resolveCurrent: () => Promise.resolve(undefined) },
			}),
		).resolves.toBeUndefined()
	})

	it('returns one exact application-owned Core Pointer', async () => {
		await expect(
			resolveRequestPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: { resolveCurrent: () => principal },
			}),
		).resolves.toBe(principal)
	})

	it('rejects malformed and foreign-application Pointer results', async () => {
		await expect(
			resolveRequestPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: { resolveCurrent: () => ({ id: 'forged' }) as never },
			}),
		).rejects.toThrow(
			new TypeError('Request principal resolver must return a Core Pointer'),
		)
		await expect(
			resolveRequestPrincipal({
				context: anonymous,
				ownsSchema: ownsPrincipalSchema,
				resolver: {
					resolveCurrent: () => ForeignPrincipal.pointer('principal-id'),
				},
			}),
		).rejects.toThrow(
			new TypeError(
				'Request principal resolver returned a foreign application schema',
			),
		)
	})

	it('passes master authority and plugin-owned values through unchanged', async () => {
		const base = anonymous.withValue(principalValue, 'operator-id')
		const master = createFixtureMasterContext(
			'audit ACL repair',
			'maintenance',
			base,
		)

		await expect(
			resolveRequestPrincipal({
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
