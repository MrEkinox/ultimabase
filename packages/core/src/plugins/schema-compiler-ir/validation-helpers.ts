import { isUnknownArray } from '@ultimabase/shared'

export const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !keys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`${path} contains unknown key: ${String(unknownKey)}`)
	}
}

export const readList = (
	value: Readonly<Record<string, unknown>>,
	key: string,
	path: string,
): readonly unknown[] => {
	const list = value[key]
	if (!isUnknownArray(list)) {
		throw new TypeError(`${path}.${key} must be a list`)
	}
	return list
}
