import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'
import type { WhereInput } from './where.js'

const Author = UltimaBase.Schema.define({
	className: 'ShorthandTypeAuthor',
	fields: (field) => ({ name: field.string() }),
})

const Other = UltimaBase.Schema.define({
	className: 'ShorthandTypeOther',
	fields: (field) => ({ name: field.string() }),
})

const Entry = UltimaBase.Schema.define({
	className: 'ShorthandTypeEntry',
	fields: (field) => ({
		amount: field.decimal(),
		author: field.pointer({ target: () => Author }),
		counter: field.bigint(),
		labels: field.string({ list: true }),
		metadata: field.json(),
		profile: field.object({
			fields: (field) => ({ email: field.string() }),
		}),
		published: field.boolean(),
		status: field.enum({ values: ['draft', 'published'] }),
		tags: field.relation({ target: () => Other }),
		title: field.string(),
		views: field.int(),
	}),
})

type EntryWhere = WhereInput<typeof Entry>

test('accepts the equality shorthand on scalar, enum and pointer fields (ADR-0307)', () => {
	expectTypeOf({
		amount: '1.25',
		counter: 2n,
		id: 'entry-1',
		published: false,
		status: 'draft',
		title: null,
		views: 3,
	} as const).toExtend<EntryWhere>()
	expectTypeOf({ author: 'author-1' }).toExtend<EntryWhere>()
	expectTypeOf({ author: Author.pointer('author-1') }).toExtend<EntryWhere>()
	expectTypeOf({ author: null }).toExtend<EntryWhere>()

	void Entry.findMany({ where: { author: Author.pointer('author-1') } })
	void Entry.findOneOrThrow({ where: { id: 'entry-1' } })
	void Entry.updateOne({ where: { id: 'entry-1' }, data: { views: 1 } })
})

test('rejects shorthand where it is ambiguous or the wrong type', () => {
	// @ts-expect-error -- A Pointer of another schema is a type error.
	void Entry.findMany({ where: { author: Other.pointer('other-1') } })
	// @ts-expect-error -- The enum shorthand keeps its literal values.
	void Entry.findMany({ where: { status: 'archived' } })
	// @ts-expect-error -- json fields keep explicit operators.
	void Entry.findMany({ where: { metadata: 'text' } })
	// @ts-expect-error -- object fields keep explicit operators.
	void Entry.findMany({ where: { profile: 'text' } })
	// @ts-expect-error -- list fields keep explicit operators.
	void Entry.findMany({ where: { labels: ['typed'] } })
	// @ts-expect-error -- relation fields keep explicit operators.
	void Entry.findMany({ where: { tags: 'other-1' } })
})

test('keeps typed builder operators beside the shorthand', () => {
	void Entry.findMany({
		where: (where) => where.eq('title', 'Hello').in('author', ['author-1']),
	})
	// @ts-expect-error -- Builder operands keep their field value type.
	void Entry.findMany({ where: (where) => where.eq('views', 'three') })
})
