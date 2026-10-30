// A shop's orders, which a payment provider marks as paid.
import { allow, defineModel } from 'ultimabase'

//#region order
export const Order = defineModel({
	name: 'Order',
	fields: (f) => ({
		total: f.number({ integer: true }),
		paid: f.boolean({ default: false }),
	}),
	// Everyone reads an order; only the server writes one.
}).with({ access: allow.readOnly })
//#endregion
