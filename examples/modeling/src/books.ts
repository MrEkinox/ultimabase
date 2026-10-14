//#region named-types
import type {
	CreateInput,
	Model,
	UniqueWhereInput,
	UpdateInput,
} from '@ultimabase/core'

import { Book } from './catalog.ts'

/** A complete book: the result of `findOne` without `select` or `include`. */
export const describeBook = (book: Model<'Book'>): string =>
	`${book.title}, ${book.price} EUR`

/** The `data` of `Book.createOne`, nested writes included. */
export const addBook = (data: CreateInput<'Book'>) => Book.createOne({ data })

/** The unique `where` and the `data` of `Book.updateOne`. */
export const editBook = (
	where: UniqueWhereInput<'Book'>,
	data: UpdateInput<'Book'>,
) => Book.updateOne({ where, data })
//#endregion named-types
