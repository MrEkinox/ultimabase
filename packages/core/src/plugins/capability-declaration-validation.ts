import { assertNonEmptyString } from '@ultimabase/shared'

/** Validates one contribution identity shared by every declaration kind. */
export const assertCapabilityContributionId: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	assertNonEmptyString(value, path)
}

/** Rejects options outside one declaration factory's exact vocabulary. */
export const assertCapabilityOptions = (
	value: Readonly<Record<PropertyKey, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
	}
}
