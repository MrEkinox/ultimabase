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
			`script-src 'nonce-${nonce}' https://esm.sh`,
			`style-src 'nonce-${nonce}' https://esm.sh`,
			"connect-src 'self' https://esm.sh",
			'font-src data:',
			'img-src data:',
			'worker-src blob: https://esm.sh',
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

/** Creates a nonce-bound page without embedding application configuration. */
export const createGraphiqlPageResponse = (graphqlPath: string): Response => {
	const nonce = globalThis.crypto.randomUUID()
	const endpoint = serializeInline(graphqlPath)
	const applicationHeader = serializeInline(httpApplicationIdHeader)
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UltimaBase GraphiQL</title>
<style nonce="${nonce}">html,body,#graphiql{height:100%;margin:0}.loading{display:grid;height:100%;place-items:center}</style>
<link rel="stylesheet" href="https://esm.sh/graphiql@5.2.4/dist/style.css" integrity="sha384-TFpQQKp325U5sd3PddH4cS0KOB3Gz/aqdEe12Mqkkq3wm2MGcDhRX5WhWf+o8akh" crossorigin="anonymous">
<script type="importmap" nonce="${nonce}">
{"imports":{"react":"https://esm.sh/react@19.2.8","react/":"https://esm.sh/react@19.2.8/","react-dom":"https://esm.sh/react-dom@19.2.8","react-dom/":"https://esm.sh/react-dom@19.2.8/","graphiql":"https://esm.sh/graphiql@5.2.4?standalone&external=react,react-dom,@graphiql/react,graphql","graphiql/":"https://esm.sh/graphiql@5.2.4/","@graphiql/react":"https://esm.sh/@graphiql/react@0.37.7?standalone&external=react,react-dom,graphql,@graphiql/toolkit,@emotion/is-prop-valid","@graphiql/toolkit":"https://esm.sh/@graphiql/toolkit@0.12.1?standalone&external=graphql","graphql":"https://esm.sh/graphql@17.0.2","@emotion/is-prop-valid":"data:text/javascript,"}}
</script>
<script type="module" nonce="${nonce}">
import React from 'react';
import ReactDOM from 'react-dom/client';
import { GraphiQL } from 'graphiql';
import 'graphiql/setup-workers/esm.sh';
const prefix='${httpBrowserBootstrapPathPrefix}/';
const remainder=window.location.pathname.slice(prefix.length);
const separator=remainder.indexOf('/');
const appId=decodeURIComponent(remainder.slice(0,separator));
const endpoint=${endpoint};
const applicationHeader=${applicationHeader};
const fetcher=async parameters=>{
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{Accept:'application/graphql-response+json, application/json', 'Content-Type':'application/json',[applicationHeader]:appId},body:JSON.stringify(parameters)});
  return response.json();
};
const namespace='ultimabase:graphiql:'+appId+':';
const storage={getItem:key=>localStorage.getItem(namespace+key),setItem:(key,value)=>localStorage.setItem(namespace+key,value),removeItem:key=>localStorage.removeItem(namespace+key),clear:()=>{},key:()=>null,get length(){return 0}};
ReactDOM.createRoot(document.getElementById('graphiql')).render(React.createElement(GraphiQL,{fetcher,storage}));
</script>
</head>
<body><div id="graphiql"><div class="loading">Loading GraphiQL…</div></div></body>
</html>`
	return new Response(html, { headers: securityHeaders(nonce) })
}
