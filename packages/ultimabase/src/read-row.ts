// A row as a caller reads it: a field a read rule may hide is optional,
// since the row leaves it out then (D-44).
import type { Hidden } from './field-rules.ts'
import type { RecordOf, StoredValue, SystemFields } from './record.ts'
import type { fieldType } from './symbols.ts'

type HiddenScalar = Hidden & {
	readonly [fieldType]: { readonly kind: 'scalar' }
}

type HiddenScalars<F> = {
	[K in keyof F]: F[K] extends HiddenScalar ? K : never
}[keyof F]

/** A record without its relations, as a caller reads it. */
export type ReadRecord<F> = [HiddenScalars<F>] extends [never]
	? RecordOf<F>
	: SystemFields & {
			readonly [
				K in Exclude<keyof F, HiddenScalars<F>> as F[K] extends {
					readonly [fieldType]: { readonly kind: 'scalar' }
				}
					? K
					: never
			]: StoredValue<F[K]>
		} & { readonly [K in HiddenScalars<F>]?: StoredValue<F[K]> }

/** The keys `S` selects. */
export type Picked<S> = {
	[K in Exclude<keyof S, '_count'>]: S[K] extends false | undefined ? never : K
}[Exclude<keyof S, '_count'>]

/** The fields a read rule may hide, once per model. */
export type HiddenKeys<F> = {
	[K in keyof F]: F[K] extends Hidden ? K : never
}[keyof F]
