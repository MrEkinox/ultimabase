import { UltimaBase } from '@ultimabase/core'

import { Publication } from './defaults.ts'
import { Customer } from './embedded-objects.ts'
import { Product } from './fields.ts'
import { Account, Session } from './pointers.ts'
import { Author, Post } from './relationships.ts'
import { Article } from './schemas.ts'

export const dataModelingApplication = new UltimaBase({
	plugins: [],
	schemas: [
		Article,
		Product,
		Publication,
		Customer,
		Account,
		Session,
		Author,
		Post,
	],
})
