import { httpPlugin } from '@ultimabase/http-plugin'

export const http = httpPlugin({
	appId: 'api',
	browser: {
		allowedHeaders: ['Content-Type', 'X-UltimaBase-Application-Id'],
		allowedMethods: ['GET', 'POST'],
		allowedOrigins: ['https://app.example'],
		credentials: false,
		maxAgeSeconds: 600,
	},
})
