import { App } from './app.ts'
import { Customer } from './customers.ts'

//#region order
export const Order = App.Schema.define({
	className: 'Order',
	fields: (field) => ({
		// Deleting a customer deletes its orders in the same transaction.
		customer: field.pointer({
			target: () => Customer,
			required: true,
			onDelete: 'cascade',
		}),
		total: field.decimal({ precision: 10, scale: 2, required: true }),
		// Assigned by the database: 1, 2, 3, ...
		number: field.bigint({ autoIncrement: true }),
		// A fresh value for each order whose input omits it.
		reference: field.uuid({ default: () => crypto.randomUUID() }),
		status: field.enum({
			values: ['pending', 'paid', 'shipped'],
			default: 'pending',
		}),
		giftWrap: field.boolean({ default: false, required: true }),
		note: field.string(),
		// Filled from the operation clock, in the application's timezone.
		placedAt: field.dateTime({ autoNow: true }),
		placedOn: field.date({ autoNow: true }),
		pickupTime: field.time(),
	}),
})
//#endregion order
