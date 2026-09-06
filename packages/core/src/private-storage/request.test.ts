import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../schema/schema/registry.js'
import { stringField } from '../schema/fields/builtins/string.js'
import { uuidField } from '../schema/fields/builtins/uuid.js'
import { definePrivateCollection } from './definition.js'
import { PrivateStorageRegistry } from './registry.js'
import {
	normalizePrivateStorageRequest,
	snapshotPrivateStorageResult,
} from './request.js'

const createFixture = () => {
	const collection = definePrivateCollection({
		contributionId: 'request-validation',
		fields: {
			id: uuidField({ immutable: true, required: true }),
			note: stringField(),
			secret: stringField({ required: true }),
		},
		indexes: [{ fields: ['id'] }, { fields: ['secret'] }],
	})
	const registry = new PrivateStorageRegistry()
	const owner = { pluginId: 'fixture.private-request' }
	const session = registry.beginDeclaration(owner, '1.0.0')
	session.registrar.register(collection)
	session.close()
	registry.close(new SchemaRegistry())
	return { descriptor: registry.resolve(collection, owner) }
}

describe('private storage request validation', () => {
	it('normalizes complete inserts and canonical optional nulls', () => {
		const { descriptor } = createFixture()
		const request = normalizePrivateStorageRequest(descriptor, 'insert', {
			data: {
				id: '0198c000-0000-7000-8000-000000000001',
				secret: 'digest',
			},
		})

		expect(request.data).toStrictEqual({
			id: '0198c000-0000-7000-8000-000000000001',
			note: null,
			secret: 'digest',
		})
		expect(Object.isFrozen(request.data)).toBe(true)
	})

	it('rejects missing fields, unknown options, non-unique lookups, and immutable updates', () => {
		const { descriptor } = createFixture()
		for (const [kind, options, message] of [
			['insert', { data: { secret: 'digest' } }, 'data.id is required'],
			[
				'find-unique',
				{ where: { note: 'visible' } },
				'where must match one exact unique index',
			],
			[
				'update',
				{
					data: { id: '0198c000-0000-7000-8000-000000000002' },
					where: { secret: 'digest' },
				},
				'cannot update immutable field: id',
			],
			[
				'find-unique',
				{ include: true, where: { secret: 'digest' } },
				'contains unknown option: include',
			],
		] as const) {
			expect(() => {
				normalizePrivateStorageRequest(descriptor, kind, options)
			}).toThrow(message)
		}
	})

	it('rejects incomplete or structurally invalid adapter results', () => {
		const { descriptor } = createFixture()
		expect(() => {
			snapshotPrivateStorageResult(descriptor, {
				id: '0198c000-0000-7000-8000-000000000001',
				secret: 'digest',
			})
		}).toThrow('must contain the complete declared record')
		expect(() => {
			snapshotPrivateStorageResult(descriptor, {
				id: 'not-a-uuid',
				note: null,
				secret: 'digest',
			})
		}).toThrow('must be a valid UUID')
	})
})
