// An application that emits declarations without isolatedDeclarations
// (D-70): a model with every field type names the kernel's types from
// outside the kernel, which must export them.
import { defineModel } from 'ultimabase'

export const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({
		name: f.string(),
		tags: f.string({ list: true }),
		age: f.number({ optional: true }),
		active: f.boolean({ default: true }),
		born: f.dateTime(),
		settings: f.json(),
		level: f.enumOf(['junior', 'senior']),
		manager: f.one(() => Profile, { optional: true, inverse: 'reports' }),
		reports: f.many(() => Profile),
	}),
})
