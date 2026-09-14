export const joinClassNames = (
	...values: readonly (string | undefined | false)[]
): string => values.filter(Boolean).join(' ')
