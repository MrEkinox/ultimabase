import { definePluginField, type PluginFieldDefinition } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

/** Creates one portable plugin field shared by PostgreSQL storage tests. */
export const createStoredPluginField = (): PluginFieldDefinition<
	'fixture.stored-json',
	string
> =>
	definePluginField(
		'fixture.stored-json',
		{ indexed: true, required: true },
		{
			snapshotValue: (value: unknown, path: string): string => {
				if (typeof value !== 'string') {
					throw new TypeError(`${path} must be a string`)
				}

				return value
			},
			storageCodec: {
				decode: (value: unknown): string => {
					if (
						!isPlainRecord(value) ||
						value.version !== 1 ||
						typeof value.value !== 'string'
					) {
						throw new TypeError('Stored plugin fixture is invalid')
					}

					return value.value
				},
				encode: (value: string) => ({ value, version: 1 }),
				format: 'json',
				version: 1,
			},
		},
	)
