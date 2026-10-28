// Full-text search (D-148): `_search` keeps the rows whose searched fields
// match a text, `_relevance` sorts them by how well.
import type { SchemaField } from './adapter.ts'
import type { fieldType } from './symbols.ts'

/** The fields of `F` built with `search: true`. */
type Searched<F> = {
	[K in keyof F]: F[K] extends {
		readonly [fieldType]: { readonly options: { readonly search: true } }
	}
		? K
		: never
}[keyof F]

/** A model with a searched field takes `_search` in its `where`. */
export type SearchWhere<F> = [Searched<F>] extends [never]
	? unknown
	: { readonly _search?: string | undefined }

/** And `_relevance` at the top of its `orderBy`. */
export type Relevance<F> = [Searched<F>] extends [never]
	? unknown
	: { readonly _relevance?: 'asc' | 'desc' | undefined }

/** The names of a model's searched fields, in declaration order. */
export const searchedFields = (
	fields: Iterable<SchemaField>,
): readonly string[] =>
	[...fields].flatMap((field) =>
		field.kind === 'scalar' && field.search === true ? [field.name] : [],
	)
