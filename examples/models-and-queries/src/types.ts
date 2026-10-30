// The shapes the catalog's model shares: an enum and a type.
import { defineEnum, defineType } from 'ultimabase'
import { z } from 'zod'

//#region enum
// One GraphQL enum and one OpenAPI schema, `Status`, for every field using it.
export const Status = defineEnum('Status', ['draft', 'published', 'archived'], {
	description: 'Where a product is in its life.',
})
//#endregion

//#region type
// A shape that is not a table: a virtual field's or a function's output.
export const Price = defineType({
	name: 'Price',
	fields: { amount: z.string(), currency: z.string() },
})
//#endregion
