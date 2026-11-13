// The models `defineSubscription`, `definePurchase`, `defineBalance` and
// `defineCreditHistory` returned, which the plugin finds among the application's at start.

/** The billing model kinds (D-373). */
export type Kind = 'subscription' | 'purchase' | 'balance' | 'history'

/** What a billing model was declared with. */
export interface Declared {
	readonly kind: Kind
	/** Its payer's or owner's model: `() => User`. */
	readonly payer: () => object
}

/** Each billing model, by its queries. */
export const billingModels: WeakMap<object, Declared> = new WeakMap()
