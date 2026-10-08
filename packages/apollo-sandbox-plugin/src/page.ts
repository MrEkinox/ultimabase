import {
	httpApplicationIdHeader,
	httpBrowserBootstrapPathPrefix,
} from '@ultimabase/http-plugin'

const serializeInline = (value: string): string =>
	JSON.stringify(value)
		.replaceAll('<', '\\u003c')
		.replaceAll('>', '\\u003e')
		.replaceAll('&', '\\u0026')
		.replaceAll('\u2028', '\\u2028')
		.replaceAll('\u2029', '\\u2029')

const securityHeaders = (nonce: string): Headers =>
	new Headers({
		'Content-Security-Policy': [
			"default-src 'none'",
			`script-src 'nonce-${nonce}' https://embeddable-sandbox.cdn.apollographql.com`,
			"style-src 'unsafe-inline'",
			"connect-src 'self'",
			'img-src data:',
			'frame-src https://sandbox.embed.apollographql.com',
			"base-uri 'none'",
			"form-action 'none'",
			"frame-ancestors 'none'",
		].join('; '),
		'Content-Type': 'text/html; charset=utf-8',
		'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
		'Referrer-Policy': 'no-referrer',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
	})

/** Creates a fixed-endpoint Sandbox page without embedding application data. */
export const createApolloSandboxPageResponse = (
	graphqlPath: string,
): Response => {
	const nonce = globalThis.crypto.randomUUID()
	const endpoint = serializeInline(graphqlPath)
	const applicationHeader = serializeInline(httpApplicationIdHeader)
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UltimaBase Apollo Sandbox</title>
<style>html,body,#sandbox{height:100%;margin:0}iframe{background:#fff}</style>
</head>
<body>
<div id="sandbox"></div>
<script nonce="${nonce}" src="https://embeddable-sandbox.cdn.apollographql.com/v2/embeddable-sandbox.umd.production.min.js"></script>
<script nonce="${nonce}">
const prefix='${httpBrowserBootstrapPathPrefix}/';
const remainder=window.location.pathname.slice(prefix.length);
const separator=remainder.indexOf('/');
const appId=decodeURIComponent(remainder.slice(0,separator));
const endpoint=${endpoint};
const applicationHeader=${applicationHeader};
new window.EmbeddedSandbox({
  target:'#sandbox',
  initialEndpoint:new URL(endpoint,window.location.origin).href,
  endpointIsEditable:false,
  hideCookieToggle:true,
  initialState:{includeCookies:false,pollForSchemaUpdates:false},
  handleRequest:(_url,options)=>{
    const headers=new Headers(options.headers);
    headers.set(applicationHeader,appId);
    return fetch(endpoint,{...options,credentials:'same-origin',headers});
  }
});
</script>
</body>
</html>`
	return new Response(html, { headers: securityHeaders(nonce) })
}
