// A model's or a function's definition takes only its own keys: a rule, a
// hook or a plugin's option given there would be dropped unread (D-370).
import { Refused } from './errors.ts'

/** Refuses a key of `definition` that `keys` does not name. */
export function knownKeys(
	name: string,
	definition: object,
	keys: readonly string[],
	goes: string,
): void {
	for (const key of Object.keys(definition)) {
		if (keys.includes(key)) continue
		throw new Refused(
			`${name}: the definition takes no ${key}; ${goes} go in .with().`,
		)
	}
}
