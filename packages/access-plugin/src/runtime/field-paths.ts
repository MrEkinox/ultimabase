/** Compares one exact declared or concrete field-value path. */
export const accessFieldPathsEqual = (
	left: readonly (number | string)[],
	right: readonly (number | string)[],
): boolean =>
	left.length === right.length &&
	left.every((segment, index) => segment === right[index])
