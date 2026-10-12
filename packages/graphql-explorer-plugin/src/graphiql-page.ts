import { graphiqlImports, graphiqlIntegrity } from './graphiql-assets.js'
import {
	explorerRequestScript,
	explorerSecurityHeaders,
	serializeInline,
} from './page-security.js'

// Every module the page loads carries its integrity hash (ADR-0325).
const importMap = serializeInline({
	imports: graphiqlImports,
	integrity: graphiqlIntegrity,
})

/** Creates a nonce-bound GraphiQL page without embedding application data. */
export const createGraphiqlPageResponse = (graphqlPath: string): Response => {
	const nonce = globalThis.crypto.randomUUID()
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UltimaBase GraphiQL</title>
<style nonce="${nonce}">html,body,#graphiql{height:100%;margin:0}.loading{display:grid;height:100%;place-items:center}</style>
<link rel="stylesheet" href="https://esm.sh/graphiql@5.2.4/dist/style.css" integrity="sha384-TFpQQKp325U5sd3PddH4cS0KOB3Gz/aqdEe12Mqkkq3wm2MGcDhRX5WhWf+o8akh" crossorigin="anonymous">
<script type="importmap" nonce="${nonce}">${importMap}</script>
<script type="module" nonce="${nonce}">
import React from 'react';
import ReactDOM from 'react-dom/client';
import { GraphiQL } from 'graphiql';
import '@graphiql/react/setup-workers/esm.sh';
${explorerRequestScript(graphqlPath)}
const fetcher=async parameters=>{
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{Accept:'application/graphql-response+json, application/json','Content-Type':'application/json',...applicationHeaders},body:JSON.stringify(parameters)});
  return response.json();
};
const namespace='ultimabase:graphiql:'+(appId??'')+':';
const storage={getItem:key=>localStorage.getItem(namespace+key),setItem:(key,value)=>localStorage.setItem(namespace+key,value),removeItem:key=>localStorage.removeItem(namespace+key),clear:()=>{},key:()=>null,get length(){return 0}};
ReactDOM.createRoot(document.getElementById('graphiql')).render(React.createElement(GraphiQL,{fetcher,storage}));
</script>
</head>
<body><div id="graphiql"><div class="loading">Loading GraphiQL…</div></div></body>
</html>`
	return new Response(html, {
		headers: explorerSecurityHeaders([
			`script-src 'nonce-${nonce}' https://esm.sh`,
			`style-src 'nonce-${nonce}' https://esm.sh`,
			"connect-src 'self' https://esm.sh",
			'font-src data:',
			'img-src data:',
			'worker-src blob: https://esm.sh',
		]),
	})
}
