import { App } from './schema.ts'

//#region profile
/** Field rules are partial: an omitted member restricts nothing. */
export const Profile = App.Schema.define({
	className: 'Profile',
	fields: (field) => ({
		// Shown in results, but never usable to filter or sort.
		email: field.string({
			access: { read: { where: false, orderBy: false } },
		}),
		// Set once: a first value is allowed, replacing or clearing it is not.
		handle: field.string({
			access: { write: { replace: false, clear: false } },
		}),
		bio: field.string(),
	}),
}).with({ access: { read: true, create: true, update: true } })
//#endregion profile
