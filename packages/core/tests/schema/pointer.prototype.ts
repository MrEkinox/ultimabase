import {
	pointerField,
	Schema,
	type InferCreateInput,
	type InferQueryResult,
	type InferUpdateInput,
} from '../../src/index.js'

const PointerUser = Schema.define({
	className: 'PointerUser',
	fields: {},
})

const /* hover:pointer-field */ authorField = pointerField({
		target: () => PointerUser,
		validation: { required: true },
	})
const PointerPost = Schema.define({
	className: 'PointerPost',
	fields: { author: authorField },
})
const /* hover:pointer-value */ author = PointerUser.pointer('user-1')

declare const createInput: InferCreateInput<typeof PointerPost>
declare const updateInput: InferUpdateInput<typeof PointerPost>
declare const selected: InferQueryResult<typeof PointerPost, 'author'>

const /* hover:create-pointer */ createAuthor = createInput.author
const /* hover:update-pointer */ updateAuthor = updateInput.author
const /* hover:selected-pointer */ selectedAuthor = selected.author

void author
void PointerPost
void createAuthor
void updateAuthor
void selectedAuthor
