// The plugin's own models (D-110, D-371 point 6), which no application
// exposes: a payer's Stripe customer, the events received, and each move
// of credits.
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master } from 'ultimabase'

export const M: { readonly as: typeof master } = { as: master }

type Text = Field<string, ScalarOptions<string>>
type Int = Field<number, { readonly integer: true }>
type Optional<V> = Field<V | null, { readonly optional: true }>

type CustomerFields = {
	/** The payer's model, `User`, and its row's id (D-373 point 3). */
	readonly model: Text
	readonly payer: Text
	/** Set once Stripe created it. */
	readonly stripeId: Field<
		string | null,
		{ readonly optional: true; readonly unique: true }
	>
	readonly syncedAt: Optional<Date>
	/** When a subscription renews, ends or changes: the hourly job syncs it. */
	readonly renewsAt: Optional<Date>
	/** Written to take the customer's lock. */
	readonly lockedAt: Optional<Date>
	/** The profile Stripe holds, as JSON. */
	readonly profile: Optional<string>
}

type CustomerIndexes = readonly [
	{ readonly fields: readonly ['model', 'payer']; readonly unique: true },
	{ readonly fields: readonly ['renewsAt'] },
]

/** One per payer (D-373 point 3). */
export const StripeCustomer: ModelOf<
	'StripeCustomer',
	CustomerFields,
	[],
	CustomerIndexes
> = defineModel({
	name: 'StripeCustomer',
	fields: (f) => ({
		model: f.string(),
		payer: f.string(),
		stripeId: f.string({ optional: true, unique: true }),
		syncedAt: f.dateTime({ optional: true }),
		renewsAt: f.dateTime({ optional: true }),
		lockedAt: f.dateTime({ optional: true }),
		profile: f.string({ optional: true }),
	}),
	indexes: [
		{ fields: ['model', 'payer'], unique: true },
		{ fields: ['renewsAt'] },
	],
})

type EventFields = {
	readonly stripeId: Field<string, { readonly unique: true }>
	/** `checkout.session.completed`: its v1 type. */
	readonly type: Text
	/** Its related object: `subscription` and its id. */
	readonly objectType: Text
	readonly objectId: Text
	readonly processedAt: Optional<Date>
}

/** Each event received, once (D-371 point 4). */
export const StripeEvent: ModelOf<'StripeEvent', EventFields, []> = defineModel(
	{
		name: 'StripeEvent',
		fields: (f) => ({
			stripeId: f.string({ unique: true }),
			type: f.string(),
			objectType: f.string(),
			objectId: f.string(),
			processedAt: f.dateTime({ optional: true }),
		}),
		indexes: [{ fields: ['processedAt'] }],
	},
)

type EntryFields = {
	/** The owner's model and id. */
	readonly model: Text
	readonly owner: Text
	readonly credit: Text
	/** Positive when given, negative when spent or taken back. */
	readonly change: Int
	readonly reason: Text
	/** The payment that gave or took it back. */
	readonly payment: Optional<string>
}

/** Each move of credits, for support (D-374 point 4). */
export const StripeCreditEntry: ModelOf<'StripeCreditEntry', EntryFields, []> =
	defineModel({
		name: 'StripeCreditEntry',
		fields: (f) => ({
			model: f.string(),
			owner: f.string(),
			credit: f.string(),
			change: f.number({ integer: true }),
			reason: f.string(),
			payment: f.string({ optional: true }),
		}),
		indexes: [{ fields: ['model', 'owner'] }],
	})
