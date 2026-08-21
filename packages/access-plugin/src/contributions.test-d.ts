import { Schema } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	schemaAccess,
	type SchemaAccessContributionDefinition,
} from './index.js'

const Document = Schema.define({
	className: 'AccessContributionPublicTypeDocument',
	fields: (field) => ({ title: field.string() }),
})

test('keeps compatible Access contributions under one master-bypass policy', () => {
	const contribution = schemaAccess(Document, { read: false })

	expectTypeOf(contribution).toEqualTypeOf<SchemaAccessContributionDefinition>()

	// @ts-expect-error -- Official Access contributions cannot override master bypass.
	schemaAccess(Document, { read: false }, { master: 'enforce' })
})
