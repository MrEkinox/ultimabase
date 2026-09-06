import { describe, expect, it } from 'vitest'

import { Schema } from '../schema/schema/definition.js'
import { SchemaRegistry } from '../schema/schema/registry.js'
import { stringField } from '../schema/fields/builtins/string.js'
import { uuidField } from '../schema/fields/builtins/uuid.js'
import { definePrivateCollection } from './definition.js'
import { PrivateStorageRegistry } from './registry.js'

const owner = (instanceId: string) => ({
	instanceId,
	pluginId: 'fixture.private-owner',
})

const collection = (contributionId: string) =>
	definePrivateCollection({
		contributionId,
		fields: { secret: stringField({ required: true }) },
		indexes: [{ fields: ['secret'] }],
	})

describe('PrivateStorageRegistry', () => {
	it('retains exact owner and version provenance for two plugin instances', () => {
		const registry = new PrivateStorageRegistry()
		const first = collection('credentials')
		const second = collection('credentials')
		const firstSession = registry.beginDeclaration(owner('first'), '1.0.0')
		firstSession.registrar.register(first)
		firstSession.close()
		const secondSession = registry.beginDeclaration(owner('second'), '2.0.0')
		secondSession.registrar.register(second)
		secondSession.close()
		registry.close(new SchemaRegistry())

		expect(registry.values()).toMatchObject([
			{
				contributionId: 'credentials',
				owner: owner('first'),
				packageVersion: '1.0.0',
			},
			{
				contributionId: 'credentials',
				owner: owner('second'),
				packageVersion: '2.0.0',
			},
		])
		expect(registry.resolve(first, owner('first'))).toBe(registry.values()[0])
		expect(() => registry.resolve(first, owner('second'))).toThrow(
			expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }),
		)
		expect(registry.fingerprint()).toMatch(/^[a-f0-9]{64}$/u)
	})

	it('rejects duplicate owner identities and token reuse before compilation', () => {
		const duplicateRegistry = new PrivateStorageRegistry()
		const duplicate = duplicateRegistry.beginDeclaration(owner('one'), '1.0.0')
		duplicate.registrar.register(collection('credentials'))
		expect(() => {
			duplicate.registrar.register(collection('credentials'))
		}).toThrow('already declared private collection "credentials"')

		const reusedRegistry = new PrivateStorageRegistry()
		const reused = collection('shared')
		const first = reusedRegistry.beginDeclaration(owner('one'), '1.0.0')
		first.registrar.register(reused)
		first.close()
		const second = reusedRegistry.beginDeclaration(owner('two'), '1.0.0')
		expect(() => {
			second.registrar.register(reused)
		}).toThrow(
			'One private collection token cannot be declared by multiple owners',
		)
	})

	it('accepts only references to exact schemas compiled by the application', () => {
		const Account = Schema.define({
			className: 'PrivateRegistryAccount',
			fields: () => ({}),
		})
		const Foreign = Schema.define({
			className: 'PrivateRegistryForeign',
			fields: () => ({}),
		})
		const referenced = definePrivateCollection({
			contributionId: 'sessions',
			fields: {
				accountId: uuidField({ required: true }),
				secret: stringField({ required: true }),
			},
			indexes: [{ fields: ['secret'] }],
			references: [{ field: 'accountId', onDelete: 'fail', target: Foreign }],
		})
		const registry = new PrivateStorageRegistry()
		const session = registry.beginDeclaration(owner('reference'), '1.0.0')
		session.registrar.register(referenced)
		session.close()

		expect(() => {
			registry.close(new SchemaRegistry([Account]))
		}).toThrow('references a schema outside this application')
	})
})
