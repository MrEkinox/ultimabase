import { describe, expect, it } from 'vitest'

import {
	RequestSubjectReference,
	createRequestPrincipalReference,
	parseRequestPrincipalReference,
	resolveRequestRoleReference,
} from './contracts.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Principal = UltimaBase.Schema.define({
	className: 'AccessPrincipal',
	fields: () => ({}),
})
const principal = Principal.pointer('principal-id')

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
