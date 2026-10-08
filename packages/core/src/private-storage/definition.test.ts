import { describe, expect, it } from 'vitest'

import { stringField } from '../schema/fields/builtins/string.js'
import { uuidField } from '../schema/fields/builtins/uuid.js'
import {
	definePrivateCollection,
	readPrivateCollectionDefinition,
} from './definition.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('definePrivateCollection', () => {
	it('retains one callback-free immutable descriptor behind a nominal token', () => {
		const Account = UltimaBase.Schema.define({
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

	// Regression: Core rejected one plugin option by its name (`postgres`); it
	// now rejects every non-Core option without knowing any plugin.
	it('rejects plugin-contributed field options generically', () => {
		for (const option of ['postgres', 'validation', 'community-option']) {
			expect(() =>
				definePrivateCollection({
					contributionId: `plugin-option-${option}`,
					fields: {
						secret: stringField({ required: true, [option]: {} } as never),
					},
				}),
			).toThrow(
				`private collection fields.secret.${option} is unavailable in private storage`,
			)
		}
	})

	it('keeps Core-owned descriptive options available', () => {
		expect(() =>
			definePrivateCollection({
				contributionId: 'described',
				indexes: [{ fields: ['secret'] }],
				fields: {
					secret: stringField({ description: 'Hashed secret', required: true }),
				},
			}),
		).not.toThrow()
	})
})
