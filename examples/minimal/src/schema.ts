import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { Schema } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

import type {} from '../.ultimabase/schema.generated.js'

const publicArticleACL = new ACL().grantPublic('delete', 'read', 'update')

/** Authors can be selected and included through the public REST graph. */
export const ExampleAuthor = Schema.define({
	className: 'ExampleAuthor',
	fields: (field) => ({
		name: field.string({ required: true, validation: z.string().min(1) }),
	}),
	acl: { default: publicArticleACL },
	rest: true,
})

/** Articles demonstrate policy, lifecycle, validation, and relationships. */
export const ExampleArticle = Schema.define({
	className: 'ExampleArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'ExampleAuthor' }),
		contributors: field.relation({ target: 'ExampleAuthor' }),
		published: field.boolean({ default: true }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
			required: true,
			validation: z.string().min(2).max(200),
		}),
	}),
	access: {
		create: true,
		delete: true,
		read: {
			allow: { count: true, exists: true, many: true, one: true },
			where: ({ where }) => where.eq('published', true),
		},
		update: true,
		upsert: true,
	},
	acl: {
		default: publicArticleACL,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? publicArticleACL,
	},
	rest: true,
})

/** Keeps the schema-owning optional plugins explicit and independently removable. */
export const minimalBehaviorPlugins = [
	accessPlugin({ default: true }),
	hooksPlugin(),
	validationPlugin(),
	aclPlugin(),
] as const

export const minimalSchemas = [ExampleAuthor, ExampleArticle] as const
