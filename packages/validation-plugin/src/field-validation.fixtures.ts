import type { StandardSchemaV1 } from '@standard-schema/spec'

export const minimumTitle: StandardSchemaV1<string> = {
	'~standard': {
		version: 1,
		vendor: 'ultimabase-tests',
		validate: (value: unknown) =>
			typeof value === 'string' && value.length >= 2
				? { value }
				: { issues: [{ message: 'Title must contain at least 2 characters' }] },
	},
}

export const scoreRange: StandardSchemaV1<number> = {
	'~standard': {
		version: 1,
		vendor: 'ultimabase-tests',
		validate: (value: unknown) =>
			typeof value === 'number' && value >= 0 && value <= 10
				? { value }
				: { issues: [{ message: 'Score must be between 0 and 10' }] },
	},
}
