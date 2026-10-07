/** Returns a value guaranteed by an adapter invariant, or fails with a stable message. */
export const required = <TValue>(
	value: TValue | undefined,
	message: string,
): TValue => {
	if (value === undefined) {
		throw new TypeError(message)
	}

	return value
}
