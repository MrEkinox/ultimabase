// push's own model (D-110): one device per session (D-408 point 3).
import type { Field, ModelOf, One, ScalarOptions } from 'ultimabase'
import { AppUser, defineModel, master } from 'ultimabase'

export const M: { readonly as: typeof master } = { as: master }

type Text = Field<string, ScalarOptions<string>>
type Unique = Field<string, { readonly unique: true }>
type DeviceFields = {
	/** `'web'`; a native app adds its own kind later. */
	readonly kind: Text
	readonly user: One<() => typeof AppUser, { readonly onDelete: 'cascade' }>
	/** The session that registered it (D-407). */
	readonly sessionId: Unique
	readonly endpoint: Unique
	readonly p256dh: Text
	readonly auth: Text
}

/** A device a user signed in on, which no transport shows. */
export const PushDevice: ModelOf<'PushDevice', DeviceFields, []> = defineModel({
	name: 'PushDevice',
	fields: (f) => ({
		kind: f.string(),
		user: f.one(() => AppUser, { onDelete: 'cascade' }),
		sessionId: f.string({ unique: true }),
		endpoint: f.string({ unique: true }),
		p256dh: f.string(),
		auth: f.string(),
	}),
	indexes: [{ fields: ['user'] }],
})
