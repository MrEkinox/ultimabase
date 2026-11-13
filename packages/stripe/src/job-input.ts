// The plugin's jobs' inputs, checked as `@ultimabase/jobs` asks.
import type { StandardSchema } from '@ultimabase/jobs'

/** A job's input: an object of the strings `keys` names. */
export function strings<const K extends string>(
	...keys: K[]
): StandardSchema<{ readonly [P in K]: string }> {
	const message = `An object of strings: ${keys.join(', ')}.`
	return {
		'~standard': {
			version: 1,
			vendor: 'ultimabase-stripe',
			validate: (value: unknown) => {
				const read: Record<string, string> = {}
				for (const key of keys) {
					const field: unknown = Reflect.get(Object(value), key)
					if (typeof field !== 'string') return { issues: [{ message }] }
					read[key] = field
				}
				return { value: read }
			},
		},
	}
}
