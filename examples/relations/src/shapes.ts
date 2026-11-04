// The other shapes a relation takes. These models are written and read by
// server code only, as Master, so they have no access rules and no GraphQL.
import { defineModel } from 'ultimabase'
import { Book } from './models.ts'

//#region one-to-one
export const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		name: f.string(),
		// Optional: a member may have no card yet.
		card: f.one(() => Card, { inverse: 'member', optional: true }),
	}),
})

export const Card = defineModel({
	name: 'Card',
	fields: (f) => ({
		number: f.string({ unique: true }),
		// Required: the side that stores the key. A card goes with its member.
		member: f.one(() => Member, { onDelete: 'cascade' }),
	}),
})
//#endregion

//#region self
export const Category = defineModel({
	name: 'Category',
	fields: (f) => ({
		name: f.string(),
		// Optional, so deleting a parent empties its children's `parent`.
		parent: f.one(() => Category, { optional: true }),
		children: f.many(() => Category, { inverse: 'parent' }),
	}),
})
//#endregion

//#region inverse
export const Branch = defineModel({
	name: 'Branch',
	fields: (f) => ({
		city: f.string(),
		outgoing: f.many(() => Transfer, { inverse: 'from' }),
		incoming: f.many(() => Transfer, { inverse: 'to' }),
	}),
})

// Two relations to Branch, each named by its own `many`.
export const Transfer = defineModel({
	name: 'Transfer',
	fields: (f) => ({
		copies: f.number({ integer: true }),
		from: f.one(() => Branch),
		to: f.one(() => Branch),
	}),
})
//#endregion

//#region one-sided
// Named by no relation: the notice stores its branch's key, and `Branch` has
// no field for its notices.
export const Notice = defineModel({
	name: 'Notice',
	fields: (f) => ({
		text: f.string(),
		branch: f.one(() => Branch, { onDelete: 'cascade' }),
	}),
})
//#endregion

//#region one-sided-many
// A many-to-many declared on one side: a reading list names its books, and
// `Book` has no field for the lists that name it.
export const ReadingList = defineModel({
	name: 'ReadingList',
	fields: (f) => ({
		title: f.string(),
		books: f.many(() => Book, { inverse: false }),
	}),
})
//#endregion

//#region join-model
export const Reader = defineModel({
	name: 'Reader',
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Membership, { inverse: 'reader' }),
	}),
})

export const Club = defineModel({
	name: 'Club',
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Membership, { inverse: 'club' }),
	}),
})

// A many-to-many with fields of its own: a model with two `one` relations.
export const Membership = defineModel({
	name: 'Membership',
	fields: (f) => ({
		role: f.enumOf(['member', 'host'], { default: 'member' }),
		reader: f.one(() => Reader, { onDelete: 'cascade' }),
		club: f.one(() => Club, { onDelete: 'cascade' }),
	}),
})
//#endregion

//#region view
export const Series = defineModel({
	name: 'Series',
	fields: (f) => ({
		title: f.string(),
		volumes: f.many(() => Volume, { inverse: 'series' }),
		// A view: the volumes its filter keeps, read-only.
		released: f.many(() => Volume, { from: 'volumes' }),
		// A one view: the one volume its filter keeps, or null.
		upcoming: f.one(() => Volume, { from: 'volumes' }),
	}),
}).with({
	relations: {
		released: { where: ({ where }) => where({ released: true }) },
		upcoming: { where: ({ where }) => where({ released: false }) },
	},
})

export const Volume = defineModel({
	name: 'Volume',
	fields: (f) => ({
		title: f.string(),
		released: f.boolean({ default: false }),
		series: f.one(() => Series, { onDelete: 'cascade' }),
	}),
	// One unreleased volume per series: what keeps `upcoming` single.
	indexes: [{ fields: ['series'], unique: true, where: { released: false } }],
})
//#endregion

//#region within
export const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		name: f.string(),
		milestones: f.many(() => Milestone, { inverse: 'project' }),
		tasks: f.many(() => Task, { inverse: 'project' }),
		notes: f.many(() => Note, { inverse: 'project' }),
	}),
})

export const Milestone = defineModel({
	name: 'Milestone',
	fields: (f) => ({
		name: f.string(),
		project: f.one(() => Project, { onDelete: 'cascade' }),
		tasks: f.many(() => Task, { inverse: 'milestone' }),
	}),
})

export const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		title: f.string(),
		project: f.one(() => Project, { onDelete: 'cascade' }),
		// The milestone's `project` is the task's `project`.
		milestone: f.one(() => Milestone, { optional: true, within: 'project' }),
		notes: f.many(() => Note, { inverse: 'tasks' }),
	}),
})
//#endregion

//#region within-many
export const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		project: f.one(() => Project, { onDelete: 'cascade' }),
		// Every task a note links has the note's `project`.
		tasks: f.many(() => Task, { inverse: 'notes', within: 'project' }),
	}),
})
//#endregion

//#region size
export const Poll = defineModel({
	name: 'Poll',
	fields: (f) => ({
		question: f.string(),
		// Every poll holds 2 to 4 choices at the end of a write.
		choices: f.many(() => Choice, {
			inverse: 'poll',
			size: { min: 2, max: 4 },
		}),
	}),
})

export const Choice = defineModel({
	name: 'Choice',
	fields: (f) => ({
		label: f.string(),
		poll: f.one(() => Poll, { onDelete: 'cascade' }),
	}),
})
//#endregion

//#region one-of
export const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		title: f.string(),
		remarks: f.many(() => Remark, { inverse: 'subject' }),
	}),
})

export const Video = defineModel({
	name: 'Video',
	fields: (f) => ({
		title: f.string(),
		url: f.string({ unique: true }),
		remarks: f.many(() => Remark, { inverse: 'subject' }),
	}),
})

export const Remark = defineModel({
	name: 'Remark',
	fields: (f) => ({
		text: f.string(),
		// One article or one video: never both, never neither.
		subject: f.oneOf(
			{ article: () => Article, video: () => Video },
			{ onDelete: 'cascade' },
		),
	}),
})
//#endregion
