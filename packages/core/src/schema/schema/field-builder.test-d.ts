import { expectTypeOf, test } from 'vitest'

import { Schema } from '../../index.js'

test('declares circular relationships by schema name without local annotations', () => {
	const User = Schema.define({
		className: 'NamedCircularUser',
		fields: (field) => ({
			posts: field.relation({
				mappedBy: 'author',
				target: 'NamedCircularPost',
			}),
		}),
	})
	const Post = Schema.define({
		className: 'NamedCircularPost',
		fields: (field) => ({
			author: field.pointer({
				target: 'NamedCircularUser',
				validation: { required: true },
			}),
		}),
	})

	expectTypeOf(User.className).toEqualTypeOf<'NamedCircularUser'>()
	expectTypeOf(Post.className).toEqualTypeOf<'NamedCircularPost'>()
})

test('rejects value-level target callbacks from the application FieldBuilder', () => {
	const Target = Schema.define({
		className: 'CallbackTarget',
		fields: () => ({}),
	})

	Schema.define({
		className: 'CallbackSource',
		fields: (field) => ({
			// @ts-expect-error -- Application relationships use stable schema names.
			target: field.pointer({ target: () => Target }),
		}),
	})
})
