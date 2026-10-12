/**
 * Refuses to start when GraphQL exposes writes and no protected policy is
 * installed, unless `publicWrites` opts in (ADR-0294, ADR-0325). Writes are
 * the generated mutations and plugin commands; operations do not count.
 */
export const assertGraphqlPublicWrites = (
	writes: readonly string[],
	hasProtectedPolicy: boolean,
	publicWrites: boolean,
): void => {
	if (publicWrites || writes.length === 0 || hasProtectedPolicy) return
	throw new TypeError(
		`GraphQL exposes writes (${writes.slice(0, 3).join(', ')}${writes.length > 3 ? ', …' : ''}) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass graphqlPlugin({ publicWrites: true }) to let every client write.`,
	)
}
