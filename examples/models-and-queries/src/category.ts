// The shortest model: the opening of the models page.
//#region category
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel } from 'ultimabase'

export const Category = defineModel({
	name: 'Category',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		position: f.number({ integer: true, default: 0 }),
	}),
}).with({ access: allow.public })
//#endregion
