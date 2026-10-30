// A shop's products, each with its stock.
import { graphql } from '@ultimabase/graphql'
import { rest } from '@ultimabase/rest'
import { allow, defineModel } from 'ultimabase'

export const Product = defineModel({
	name: 'Product',
	use: [graphql(), rest()],
	fields: (f) => ({
		sku: f.string({ unique: true }),
		name: f.string(),
		stock: f.number({ integer: true, default: 0 }),
	}),
}).with({ access: allow.readOnly })
