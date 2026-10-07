import { assertNonEmptyString } from '@ultimabase/shared'

import { assertExactObjectKeys } from '../exact-object-validation.js'

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
	assertExactObjectKeys(value, keys, `${path} contains unknown option: `)
}
