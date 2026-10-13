//#region factory
import { UltimaBase } from '@ultimabase/core'

import { database } from './database.ts'

/** The configured factory types the `postgres` rule and field option. */
export const App = UltimaBase.use(database)
//#endregion factory

//#region staff-member
/** Stored in `staff_members`: a plural `snake_case` table name. */
export const StaffMember = App.Schema.define({
	className: 'StaffMember',
	fields: (field) => ({
		name: field.string({ required: true }),
		// A unique index: a duplicate fails with UNIQUE_VIOLATION.
		email: field.string({ required: true, indexed: 'unique' }),
	}),
})
//#endregion staff-member

//#region tag
export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		label: field.string({ required: true, indexed: 'unique' }),
	}),
})
//#endregion tag

//#region article
/** Each field kind maps to one PostgreSQL column type. */
export const Article = App.Schema.define({
	className: 'Article',
	fields: (field) => ({
		slug: field.string({ required: true, indexed: 'unique' }), // text
		// Release 2 renamed `headline`: remove `renamedFrom` once every
		// database has applied the rename.
		title: field.string({
			required: true,
			postgres: { renamedFrom: 'headline' },
		}),
		status: field.enum({ values: ['draft', 'published'], default: 'draft' }), // text
		wordCount: field.int(), // bigint
		rating: field.float(), // double precision
		price: field.decimal({ precision: 8, scale: 2 }), // numeric(8, 2)
		publishedAt: field.dateTime(), // timestamp(3) with time zone
		keywords: field.string({ list: true }), // jsonb
		metadata: field.json(), // jsonb
		// A uuid column with a named foreign key.
		author: field.pointer({
			target: () => StaffMember,
			required: true,
			onDelete: 'cascade',
		}),
		// A hidden join table with one row per (article, tag) pair.
		tags: field.relation({ target: () => Tag }),
	}),
}).with({
	postgres: { table: 'newsroom_articles' },
	indexes: [
		{ fields: ['author', 'createdAt'] },
		// A partial index: only published rows are indexed.
		{ fields: ['publishedAt'], where: { status: 'published' } },
	],
})
//#endregion article

//#region contribution
/** An edge with its own data: two pointers and a composite unique index. */
export const Contribution = App.Schema.define({
	className: 'Contribution',
	fields: (field) => ({
		article: field.pointer({
			target: () => Article,
			required: true,
			onDelete: 'cascade',
		}),
		// `restrict` (the default) refuses to delete a member who contributed.
		member: field.pointer({
			target: () => StaffMember,
			required: true,
			onDelete: 'restrict',
		}),
		role: field.enum({ values: ['writer', 'editor'], required: true }),
	}),
	indexes: [{ fields: ['article', 'member'], unique: true }],
})
//#endregion contribution
