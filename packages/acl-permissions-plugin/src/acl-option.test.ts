import {
	definePluginFieldWireProtocol,
	getPluginFieldStorageCodec,
	getPluginFieldWireCodec,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import {
	aclField,
	aclFieldKind,
	aclFeatureDeclared,
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

	it('owns the canonical GraphQL field JSON boundary', () => {
		const protocol = definePluginFieldWireProtocol({
			name: 'ultimabase.graphql.field',
			version: '1.0.0',
		})
		const codec = getPluginFieldWireCodec(aclField, protocol)
		const source = new ACL().grantPublic('read')

		expect(codec?.encode(source)).toStrictEqual(source.toJSON())
		expect(codec?.decode(source.toJSON())).toBeInstanceOf(ACL)
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
		const resolveInput: ACLInputResolver = ({ currentAcl }) => currentAcl
		const clientSharing = () => true
		const existingRows = new ACL().grantAuthenticated('read')
		const option = normalizeACLSchemaOption(
			{ default: new ACL(), limits, resolveInput, clientSharing, existingRows },
			'Post.acl',
		)

		limits.maxPrincipals = 20

		expect(option.limits).toStrictEqual({
			maxPrincipals: 10,
			maxRoles: 5,
		})
		expect(option.resolveInput).toBe(resolveInput)
		expect(option.clientSharing).toBe(clientSharing)
		expect(option.existingRows).toBe(existingRows)
		expect(Object.isFrozen(option.limits)).toBe(true)
	})

	it('rejects malformed direct configuration', () => {
		expect(() =>
			normalizeACLSchemaOption({ default: 'public' }, 'Post.acl'),
		).toThrow(new TypeError('Post.acl.default must be an ACL or a function'))
		const empty = new ACL()
		expect(() =>
			normalizeACLSchemaOption(
				{ default: empty, resolveInput: true },
				'Post.acl',
			),
		).toThrow(new TypeError('Post.acl.resolveInput must be a function'))
		expect(() =>
			normalizeACLSchemaOption(
				{ default: empty, limits: { maxPrincipals: -1 } },
				'Post.acl',
			),
		).toThrow(
			new RangeError(
				'Post.acl.limits.maxPrincipals must be a non-negative safe integer',
			),
		)
		expect(() => normalizeACLSchemaOption({ extra: true }, 'Post.acl')).toThrow(
			new TypeError('Unknown Post.acl option: extra'),
		)
		// ADR-0321: `default` is required, `existingRows` is a fixed ACL.
		expect(() => normalizeACLSchemaOption({}, 'Post.acl')).toThrow(
			new TypeError('Post.acl.default must be an ACL or a function'),
		)
		expect(() =>
			normalizeACLSchemaOption(
				{ default: empty, existingRows: () => empty },
				'Post.acl',
			),
		).toThrow(new TypeError('Post.acl.existingRows must be an ACL'))
		expect(() =>
			normalizeACLSchemaOption(
				{ default: empty, clientSharing: true },
				'Post.acl',
			),
		).toThrow(new TypeError('Post.acl.clientSharing must be a function'))
		expect(() =>
			normalizeACLSchemaOption(aclFeatureDeclared, 'Post.acl'),
		).toThrow(
			new TypeError(
				'Post.acl: the acl feature needs .with({ acl: { default } }); an empty ACL would hide every row from everyone but Master',
			),
		)
	})
})
