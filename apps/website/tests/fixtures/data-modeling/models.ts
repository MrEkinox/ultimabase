import { Product } from './fields.js'

export const createProductDraft = () =>
	new Product({
		price: '19.90',
		tags: ['typescript'],
	})

export const serializeProductDraft = () => createProductDraft().toJSON()
