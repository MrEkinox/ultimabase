const declarationMethods = new WeakSet<object>()

/**
 * @internal Marks the declaration method `.with` of a schema. It yields to an
 * application static mutation of the same name, so a schema declared without
 * `.with` can still be registered as it is.
 */
export const markSchemaDeclarationMethod = <TMethod extends object>(
	method: TMethod,
): TMethod => {
	declarationMethods.add(method)
	return method
}

/** @internal Reports whether one static value is a declaration chain method. */
export const isSchemaDeclarationMethod = (value: unknown): boolean =>
	(typeof value === 'function' || typeof value === 'object') &&
	value !== null &&
	declarationMethods.has(value)
