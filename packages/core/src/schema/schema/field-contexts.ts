import { immutableArray, isUnknownArray } from '@ultimabase/shared'

/** Names the four semantic locations where a field-like declaration may appear. */
export const fieldDeclarationContexts = [
	'stored',
	'embedded',
	'virtual',
	'output',
] as const

/** Distinguishes persistence, embedded values, virtual wrappers, and output values. */
export type FieldDeclarationContext = (typeof fieldDeclarationContexts)[number]

const fieldDeclarationContextSet: ReadonlySet<unknown> = new Set(
	fieldDeclarationContexts,
)

/** Rejects values outside Core's closed contextual declaration vocabulary. */
export const assertFieldDeclarationContext: (
	value: unknown,
	path: string,
) => asserts value is FieldDeclarationContext = (value, path) => {
	if (!fieldDeclarationContextSet.has(value)) {
		throw new TypeError(`${path} must be stored, embedded, virtual, or output`)
	}
}

/** Snapshots one non-empty duplicate-free context list in canonical order. */
export const normalizeFieldDeclarationContexts = (
	value: unknown,
	path: string,
): readonly FieldDeclarationContext[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty list`)
	}

	const declared = new Set<FieldDeclarationContext>()
	for (const [index, context] of value.entries()) {
		assertFieldDeclarationContext(context, `${path}[${String(index)}]`)
		if (declared.has(context)) {
			throw new TypeError(`${path} contains duplicate context: ${context}`)
		}
		declared.add(context)
	}

	return immutableArray(
		fieldDeclarationContexts.filter((context) => declared.has(context)),
	)
}
