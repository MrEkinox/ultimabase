import { Schema, stringField } from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import {
	acl,
	aclFieldKind,
	aclPluginName,
	aclSchemaExtensionName,
	type ACLInputResolver,
} from './acl-extension.js'
import { ACL } from './acl.js'

describe('acl schema extension', () => {
	it('injects one immutable required ACL field through the neutral extension contract', () => {
		const extension = acl()
		const schema = Schema.define({
			className: 'ProtectedPost',
			fields: { title: stringField() },
			extensions: [extension],
		})

		expect(extension).toMatchObject({
			name: aclSchemaExtensionName,
			pluginName: aclPluginName,
			scope: 'schema',
		})
		expect(extension.fields.acl.kind).toBe(aclFieldKind)
		expect(extension.fields.acl.options.validation.required).toBe(true)
		expect(schema.fields.acl).toBe(extension.fields.acl)
		expect(extension.config.default).toBeInstanceOf(ACL)
		expect(Object.isFrozen(extension)).toBe(true)
		expect(Object.isFrozen(extension.config)).toBe(true)
	})

	it('retains static and asynchronous defaults without executing callbacks', () => {
		const value = new ACL().grantPublic('read')
		const staticExtension = acl({ default: value })
		const factory = vi.fn(() => Promise.resolve(value))
		const dynamicExtension = acl({ default: factory })

		expect(staticExtension.config.default).toBe(value)
		expect(dynamicExtension.config.default).toBe(factory)
		expect(factory).not.toHaveBeenCalled()
	})

	it('normalizes callbacks and schema-level limits without mutating source options', () => {
		const limits = { maxPrincipals: 10, maxRoles: 5 }
		const resolveInput: ACLInputResolver = ({ inputAcl }) => inputAcl
		const extension = acl({ limits, resolveInput })

		limits.maxPrincipals = 20

		expect(extension.config.limits).toStrictEqual({
			maxPrincipals: 10,
			maxRoles: 5,
		})
		expect(extension.config.resolveInput).toBe(resolveInput)
		expect(Object.isFrozen(extension.config.limits)).toBe(true)
	})

	it('rejects malformed configuration and reserved field collisions', () => {
		expect(() => acl({ default: 'public' as never })).toThrow(
			new TypeError('acl default must be an ACL or a function'),
		)
		expect(() => acl({ resolveInput: true as never })).toThrow(
			new TypeError('acl resolveInput must be a function'),
		)
		expect(() => acl({ limits: { maxPrincipals: -1 } })).toThrow(
			new RangeError(
				'acl limits.maxPrincipals must be a non-negative safe integer',
			),
		)
		expect(() =>
			Schema.define({
				className: 'InvalidProtectedPost',
				fields: { acl: stringField() },
				extensions: [acl()],
			}),
		).toThrow(new TypeError('Reserved schema extension field: acl'))
	})
})
