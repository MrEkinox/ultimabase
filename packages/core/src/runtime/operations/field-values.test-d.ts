import {
	QueryBuilder,
	Schema,
	transformOperationFieldInputs,
	type CreateOneOperationAst,
	type RuntimeFieldInputVisitor,
} from '../../index.js'
import { expectTypeOf, test } from 'vitest'

const FieldInputRecord = Schema.define({
	className: 'FieldInputTypeContract',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
const query = new QueryBuilder(FieldInputRecord).ast
const operation = {
	input: { title: 'before' },
	kind: 'create-one',
	schema: query.schema,
	selection: query.selection,
} satisfies CreateOneOperationAst<typeof FieldInputRecord>

const visitor: RuntimeFieldInputVisitor = ({ fieldPath, value }) =>
	fieldPath[0] === 'title' ? value : undefined

test('preserves the exact operation type through public field transformation', () => {
	expectTypeOf(transformOperationFieldInputs(operation, visitor)).toEqualTypeOf<
		Promise<typeof operation>
	>()
})
