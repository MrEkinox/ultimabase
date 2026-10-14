//#region address
import type { EmbeddedFieldBuilder } from '@ultimabase/core'

/** One reusable child shape for every address of a customer. */
export const addressFields = (field: EmbeddedFieldBuilder) => ({
	line1: field.string({ required: true }),
	line2: field.string(),
	city: field.string({ required: true }),
	countryCode: field.string({ required: true }),
})
//#endregion address
