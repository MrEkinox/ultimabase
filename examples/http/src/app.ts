// The application: its routes over HTTP, beside no other transport.
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Order } from './models.ts'
import { shop } from './routes.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	//#region plugins
	plugins: [
		httpPlugin({
			routes: [shop],
			// The site that calls the API from a browser, with its cookies;
			// local origins are allowed too, outside production.
			cors: ['https://shop.example.com'],
			// 64 KB per request body; 1 MB by default.
			bodyLimit: 64 * 1024,
			// One proxy in front: the client's address is read from
			// X-Forwarded-For.
			proxies: 1,
		}),
	],
	//#endregion
	models: [Order],
})
