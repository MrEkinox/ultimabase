// The shop's stock report, written as server code.
//#region low-stock
import { master } from 'ultimabase'
import { Product } from './models.ts'

/** The five products with the least stock. */
export const lowStock = () =>
	Product.findMany(
		{
			where: { stock: { lt: 10 } },
			orderBy: { stock: 'asc' },
			take: 5,
			select: { name: true, stock: true },
		},
		{ as: master },
	)
//#endregion
