const declarationMethods = new WeakSet<object>()

/**
 * @internal Marks one schema declaration chain method (`.with`, shape methods).
 * Such a method yields to an application static mutation of the same name, so
 * a schema declared with the chain can still be registered as it is.
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
