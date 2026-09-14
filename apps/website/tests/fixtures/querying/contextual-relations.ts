import { Schema } from '@ultimabase/core'

export const Channel = Schema.define({
	className: 'QueryChannel',
	fields: (field) => ({
		messages: field.relation({
			target: 'QueryMessage',
			where: ({ context, where }) =>
				context.access.mode === 'master' ? where : where.eq('published', true),
		}),
		name: field.string({ required: true }),
	}),
})

export const Message = Schema.define({
	className: 'QueryMessage',
	fields: (field) => ({
		body: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
})
