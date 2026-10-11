// Acceptance rules of query inputs (ADR-0315 decision 4): each rejected case
// is reported on its own line, each accepted case compiles. A typo in `select`
// or `include` names the misspelled field (ADR-0315 amendment, point 4).
import type { Select, Where } from '@ultimabase/core'

import { Todo } from './todo.ts'

declare const dynamicSelect: Select<'Todo'>
declare const flag: boolean
declare const where: Where<'Todo'>
const extraSelection = { title: true, titel: true } as const
const extraClause = { where: { title: { eq: 'x' } }, extra: 1 }

/** Rejected: a selection that is not literal, or names an unknown field. */
export const rejectedReads = () => [
	// @ts-expect-error -- a dynamic selection cannot type an exact result.
	Todo.findMany({ select: dynamicSelect }),
	// @ts-expect-error -- a `boolean` flag cannot type an exact result.
	Todo.findMany({ select: { title: flag } }),
	// @ts-expect-error -- `titel` is not a field, even outside a literal.
	Todo.findMany({ select: extraSelection }),
	// @ts-expect-error -- `selct` is not a clause.
	Todo.findMany({ where: { title: { eq: 'x' } }, selct: { title: true } }),
	// @ts-expect-error -- `titel` is not a field.
	Todo.findMany({ select: { title: true, titel: true } }),
	// @ts-expect-error -- `titel` is not a field.
	Todo.findMany({ select: { titel: true } }),
	// @ts-expect-error -- `labl` is not a field of Tag.
	Todo.findMany({ include: { tags: { select: { labl: true } } } }),
	// @ts-expect-error -- `tagz` is not a relationship of Todo.
	Todo.findMany({ include: { tagz: {} } }),
	// @ts-expect-error -- `titel` is not a field.
	Todo.findMany({ where: { titel: { eq: 'x' } } }),
	// @ts-expect-error -- `titel` is not a field.
	Todo.findOne({ select: { titel: true } }),
	// @ts-expect-error -- `titel` is not a field.
	Todo.findOneOrThrow({ select: { titel: true } }),
]

/** Rejected: the same selection and inclusion rules on writes. */
export const rejectedWrites = () => [
	// @ts-expect-error -- `titel` is not a field.
	Todo.createOne({ data: { title: 'x' }, select: { titel: true } }),
	// @ts-expect-error -- `tagz` is not a relationship of Todo.
	Todo.createMany({ data: [{ title: 'x' }], include: { tagz: {} } }),
	Todo.updateOne({
		where: { id: 'x' },
		data: { archived: true },
		// @ts-expect-error -- `titel` is not a field.
		select: { titel: true },
	}),
	// @ts-expect-error -- `titel` is not a field.
	Todo.deleteOne({ where: { id: 'x' }, select: { titel: true } }),
	// @ts-expect-error -- `titel` is not a field.
	Todo.deleteMany({ where: [{ id: 'x' }], select: { titel: true } }),
]

/** Accepted: literal projections, filter values and non-literal clause objects. */
export const acceptedReads = () => [
	Todo.findMany({ where }),
	Todo.findMany(extraClause),
	Todo.findMany({ select: { title: true, archived: false } }),
	Todo.findMany({ select: { archived: false } }),
	Todo.findMany({
		where: { archived: { eq: false } },
		include: {
			tags: { select: { label: true }, where: { label: { eq: 'x' } } },
			assignee: { select: { email: true } },
		},
		take: 10,
	}),
	Todo.findOne({ select: { title: true }, include: { parent: {} } }),
	Todo.createOne({ data: { title: 'x' }, select: { title: true } }),
	Todo.deleteOne({ where: { id: 'x' }, select: { title: true } }),
]
