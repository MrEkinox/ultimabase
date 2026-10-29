// The other shapes a relation takes. These models are written and read by
// server code only, as Master, so they have no access rules and no GraphQL.
import { defineModel } from 'ultimabase'

//#region one-to-one
export const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		name: f.string(),
		// Optional: a member may have no card yet.
		card: f.one(() => Card, { optional: true }),
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
		children: f.many(() => Category),
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

// Two relations to Branch: each side names the other with `inverse`.
export const Transfer = defineModel({
	name: 'Transfer',
	fields: (f) => ({
		copies: f.number({ integer: true }),
		from: f.one(() => Branch, { inverse: 'outgoing' }),
		to: f.one(() => Branch, { inverse: 'incoming' }),
	}),
})
//#endregion

//#region join-model
export const Reader = defineModel({
	name: 'Reader',
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Membership),
	}),
})

export const Club = defineModel({
	name: 'Club',
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Membership),
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
		volumes: f.many(() => Volume),
		// A view: the volumes its filter keeps, read-only.
		released: f.many(() => Volume, { from: 'volumes' }),
	}),
}).with({
	relations: {
		released: { where: ({ where }) => where({ released: true }) },
	},
})

export const Volume = defineModel({
	name: 'Volume',
	fields: (f) => ({
		title: f.string(),
		released: f.boolean({ default: false }),
		series: f.one(() => Series, { onDelete: 'cascade' }),
	}),
})
//#endregion
