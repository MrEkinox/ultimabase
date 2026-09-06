import { describe, expect, it } from 'vitest'

import { Schema } from '../schema/schema/definition.js'
import { stringField } from '../schema/fields/builtins/string.js'
import { uuidField } from '../schema/fields/builtins/uuid.js'
import {
	definePrivateCollection,
	readPrivateCollectionDefinition,
} from './definition.js'

describe('definePrivateCollection', () => {
	it('retains one callback-free immutable descriptor behind a nominal token', () => {
		const Account = Schema.define({
			className: 'PrivateReferenceAccount',
			fields: (field) => ({ name: field.string() }),
		})
		const collection = definePrivateCollection({
			contributionId: 'credentials',
			fields: {
				accountId: uuidField({ required: true }),
				secret: stringField({ required: true }),
			},
			indexes: [{ fields: ['accountId'] }],
			normalizedStaticOptions: { algorithm: 'fixture-v1' },
			references: [
				{ field: 'accountId', onDelete: 'cascade', target: Account },
			],
		})

		expect(collection).toStrictEqual({ kind: 'private-collection' })
		expect(Object.isFrozen(collection)).toBe(true)
		expect(readPrivateCollectionDefinition(collection)).toMatchObject({
			contributionId: 'credentials',
			protocolVersion: 1,
		})
		expect(() =>
			readPrivateCollectionDefinition({ kind: 'private-collection' }),
		).toThrow('private collection must be created by definePrivateCollection')
	})

	it('rejects non-portable fields, callbacks, and invalid unique selectors', () => {
		expect(() =>
			definePrivateCollection({
				contributionId: 'callback',
				fields: { secret: stringField({ required: true }) },
				indexes: [{ fields: ['secret'] }],
				normalizedStaticOptions: { callback: (() => 'secret') as never },
			}),
		).toThrow(
			'private collection normalizedStaticOptions.callback must be a JSON value',
		)

		expect(() =>
			definePrivateCollection({
				contributionId: 'optional-index',
				fields: { label: stringField() },
				indexes: [{ fields: ['label'] }],
			}),
		).toThrow('unique fields must be required: label')
	})
})
