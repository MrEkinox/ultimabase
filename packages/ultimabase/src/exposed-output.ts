// A function's output as transports read it (D-109, D-182).
import type { StandardSchema } from './fields.ts'

/** How an output holds a model or a type (D-109). */
export type OutputForm = 'one' | 'nullable' | 'list'

/** A function's or a type's output, as transports read it (D-109). */
export type ExposedOutput =
	| { readonly kind: 'schema'; readonly schema: StandardSchema }
	| { readonly kind: 'model'; readonly name: string; readonly form: OutputForm }
	| {
			readonly kind: 'type'
			readonly type: ExposedType
			readonly form: OutputForm
	  }
	/** `Model.paginated()`: `run` returns the model's `paginate` (D-182). */
	| { readonly kind: 'page'; readonly name: string }

/** A `defineType`, its fields in their order (D-109). */
export interface ExposedType {
	readonly name: string
	readonly description: string | undefined
	readonly fields: ReadonlyMap<string, ExposedOutput>
}
