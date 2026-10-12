import {
	explorerRequestScript,
	explorerSecurityHeaders,
} from './page-security.js'

/**
 * Creates a fixed-endpoint Apollo Sandbox page. Apollo publishes no pinned
 * version of this script, so it carries no integrity hash: a documented
 * risk, limited by serving the page in development only (ADR-0325).
 */
export const createApolloSandboxPageResponse = (
	graphqlPath: string,
): Response => {
	const nonce = globalThis.crypto.randomUUID()
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
${explorerRequestScript(graphqlPath)}
new window.EmbeddedSandbox({
  target:'#sandbox',
  initialEndpoint:new URL(endpoint,window.location.origin).href,
  endpointIsEditable:false,
  hideCookieToggle:true,
  initialState:{includeCookies:false,pollForSchemaUpdates:false},
  handleRequest:(_url,options)=>{
    const headers=new Headers(options.headers);
    for (const [name,value] of Object.entries(applicationHeaders)) headers.set(name,value);
    return fetch(endpoint,{...options,credentials:'same-origin',headers});
  }
});
</script>
</body>
</html>`
	return new Response(html, {
		headers: explorerSecurityHeaders([
			`script-src 'nonce-${nonce}' https://embeddable-sandbox.cdn.apollographql.com`,
			"style-src 'unsafe-inline'",
			"connect-src 'self'",
			'img-src data:',
			'frame-src https://sandbox.embed.apollographql.com',
		]),
	})
}
