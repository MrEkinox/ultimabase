// The application on a platform that writes the client's address into a
// header of its own, as DigitalOcean App Platform does (D-405).
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Order } from './models.ts'
import { shop } from './routes.ts'

export const onPlatform = defineApp({
	database: memory(),
	//#region platform
	plugins: [
		httpPlugin({
			routes: [shop],
			// The header the platform writes over the one a client sends:
			// HTTP_ADDRESS_HEADER=do-connecting-ip on DigitalOcean.
			addressHeader: process.env.HTTP_ADDRESS_HEADER,
		}),
	],
	//#endregion
	models: [Order],
})
