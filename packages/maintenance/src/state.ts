// The maintenance's one row (D-110, D-205), which no transport exposes.
import type { Field, ModelOf } from 'ultimabase'
import { defineModel } from 'ultimabase'

type StateFields = {
	readonly key: Field<string, { readonly unique: true }>
	readonly enabled: Field<boolean, {}>
}

/** maintenance's own model (D-110). */
export const MaintenanceState: ModelOf<'MaintenanceState', StateFields, []> =
	defineModel({
		name: 'MaintenanceState',
		fields: (f) => ({
			key: f.string({ unique: true }),
			enabled: f.boolean(),
		}),
	})
