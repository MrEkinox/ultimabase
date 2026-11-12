// The application: its routes over HTTP, beside no other transport, and the
// jobs its webhook enqueues.
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { defineApp, memory } from 'ultimabase'
import { Order } from './models.ts'
import { shop } from './routes.ts'
import { PaymentEvent, payments, sendReceipt } from './webhook.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	//#region plugins
	plugins: [
		httpPlugin({
			routes: [shop, payments],
			// The site that calls the API from a browser, with its cookies;
			// local origins are allowed too, outside production.
			cors: ['https://shop.example.com'],
			// 64 KB per request body; 1 MB by default.
			bodyLimit: 64 * 1024,
			// One proxy in front: the client's address is read from
			// X-Forwarded-For.
			proxies: 1,
			// 100 requests a minute per client address; 600 by default, false
			// for none.
			rateLimit: { requests: 100, window: 60_000 },
		}),
		jobsPlugin({ jobs: [sendReceipt] }),
	],
	//#endregion
	models: [Order, PaymentEvent],
})
