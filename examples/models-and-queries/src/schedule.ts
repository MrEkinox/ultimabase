// A shop's schedule: a list with a size, and a shared enum used inside a JSON
// field's schema.
import { graphql } from '@ultimabase/graphql'
import { allow, defineEnum, defineModel } from 'ultimabase'
import { z } from 'zod'

//#region list-size
export const Shift = defineModel({
	name: 'Shift',
	use: [graphql()],
	fields: (f) => ({
		// At least one person, five at most.
		staff: f.string({ list: true, size: { min: 1, max: 5 } }),
	}),
}).with({ access: allow.public })
//#endregion

//#region shared-enum
const Weekday = defineEnum('Weekday', ['monday', 'tuesday', 'wednesday'])

// The same name and the same values: one type, wherever it is used.
const weekday = z.enum(Weekday.values).meta({ id: 'Weekday' })

export const Opening = defineModel({
	name: 'Opening',
	use: [graphql()],
	fields: (f) => ({
		availableOn: f.enumOf(Weekday, { list: true }),
		searchFilters: f.json({
			validate: z
				.object({ availableOn: z.array(weekday) })
				.meta({ id: 'SearchFilters' }),
		}),
	}),
}).with({ access: allow.public })
//#endregion
