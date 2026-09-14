import { Schema } from '@ultimabase/core'

import type {} from './.ultimabase/schema.generated.js'

export const ApiPost = Schema.define({
	className: 'ApiPost',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
	graphql: true,
	rest: true,
})
