import { httpPlugin } from '@ultimabase/http-plugin'

export const applicationHttp = httpPlugin({
	appId: 'blog',
	browser: {
		allowedHeaders: ['Content-Type', 'X-UltimaBase-Application-Id'],
		allowedMethods: ['GET', 'POST'],
		allowedOrigins: ['https://console.example'],
		credentials: false,
		maxAgeSeconds: 600,
	},
	requestTimeoutMs: 15_000,
})
