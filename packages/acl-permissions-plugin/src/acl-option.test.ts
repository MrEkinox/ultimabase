import {
	definePluginFieldWireProtocol,
	getPluginFieldStorageCodec,
	getPluginFieldWireCodec,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import {
	aclField,
	aclFieldKind,
	normalizeACLSchemaOption,
	type ACLInputResolver,
} from './acl-option.js'
import { ACL } from './acl.js'

describe('acl schema option', () => {
	it('keeps the unchanged immutable required ACL field definition', () => {
		expect(aclField.kind).toBe(aclFieldKind)
		expect(aclField.options.required).toBe(true)
		expect(aclField.options.indexed).toBe(true)
	})

	it('round-trips strict versioned ACL documents through its private codec', () => {
		const codec = getPluginFieldStorageCodec(aclField)
		const source = new ACL().grantPublic('read')
		const encoded = codec?.encode(source)
		const decoded = codec?.decode(encoded)

		expect(encoded).toStrictEqual(source.toJSON())
		expect(decoded).toBeInstanceOf(ACL)
		if (!(decoded instanceof ACL)) {
			throw new TypeError('ACL storage codec must restore an ACL')
		}
		expect(decoded.toJSON()).toStrictEqual(source.toJSON())
		expect(() => codec?.decode({ version: 2 })).toThrow()
	})

	it('shares its strict JSON boundary with the canonical REST v1 protocol', () => {
		const protocol = definePluginFieldWireProtocol({
			name: 'ultimabase.rest',
			version: '1.0.0',
		})
		const codec = getPluginFieldWireCodec(aclField, protocol)
		const source = new ACL().grantPublic('read')
		const encoded = codec?.encode(source)
		const decoded = codec?.decode(encoded)

		expect(encoded).toStrictEqual(source.toJSON())
		expect(decoded).toBeInstanceOf(ACL)
		expect(decoded instanceof ACL ? decoded.toJSON() : undefined).toStrictEqual(
			source.toJSON(),
		)
	})

	it('retains static and asynchronous defaults without executing callbacks', () => {
		const value = new ACL().grantPublic('read')
		const staticOption = normalizeACLSchemaOption(
			{ default: value },
			'Post.acl',
		)
		const factory = vi.fn(() => Promise.resolve(value))
		const dynamicOption = normalizeACLSchemaOption(
			{ default: factory },
			'Post.acl',
		)

		expect(staticOption.default).toBe(value)
		expect(dynamicOption.default).toBe(factory)
		expect(factory).not.toHaveBeenCalled()
	})

	it('normalizes callbacks and schema-level limits without mutating source options', () => {
		const limits = { maxPrincipals: 10, maxRoles: 5 }
		const resolveInput: ACLInputResolver = ({ inputAcl }) => inputAcl
		const option = normalizeACLSchemaOption(
			{ limits, resolveInput },
			'Post.acl',
		)

		limits.maxPrincipals = 20

		expect(option.limits).toStrictEqual({
			maxPrincipals: 10,
			maxRoles: 5,
		})
		expect(option.resolveInput).toBe(resolveInput)
		expect(Object.isFrozen(option.limits)).toBe(true)
	})

	it('rejects malformed direct configuration', () => {
		expect(() =>
			normalizeACLSchemaOption({ default: 'public' }, 'Post.acl'),
		).toThrow(new TypeError('Post.acl.default must be an ACL or a function'))
		expect(() =>
			normalizeACLSchemaOption({ resolveInput: true }, 'Post.acl'),
		).toThrow(new TypeError('Post.acl.resolveInput must be a function'))
		expect(() =>
			normalizeACLSchemaOption({ limits: { maxPrincipals: -1 } }, 'Post.acl'),
		).toThrow(
			new RangeError(
				'Post.acl.limits.maxPrincipals must be a non-negative safe integer',
			),
		)
		expect(() => normalizeACLSchemaOption({ extra: true }, 'Post.acl')).toThrow(
			new TypeError('Unknown Post.acl option: extra'),
		)
	})
})
