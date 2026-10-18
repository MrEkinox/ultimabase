import type { ExposedWriteMethod } from '@ultimabase/core'
import { assertPublicWrites } from '@ultimabase/plugin-kit'

/** One root field that writes, with the plan entry that serves it. */
export interface GraphqlWriteRoot {
	readonly field: string
	readonly write: ExposedWriteMethod
}

/**
 * Refuses to start when GraphQL exposes writes and no protected policy is
 * installed, unless `publicWrites` opts in (ADR-0294, ADR-0325). Writes are
 * the generated mutations and plugin commands, named by root field in
 * schema order; operations do not count.
 */
export const assertGraphqlPublicWrites = (
	roots: readonly GraphqlWriteRoot[],
	hasProtectedPolicy: boolean,
	publicWrites: boolean,
): void => {
	const fields = new Map(roots.map(({ field, write }) => [write, field]))
	assertPublicWrites({
		describe: (write) =>
			fields.get(write) ?? `${write.schema}.${write.method.entry.method}`,
		hasProtectedPolicy,
		hint: 'graphqlPlugin({ publicWrites: true })',
		label: 'GraphQL',
		publicWrites,
		writes: roots.map(({ write }) => write),
	})
}
