// GraphiQL 5 (D-107): the page a browser gets at `/graphql` outside
// production, its modules loaded from esm.sh at pinned versions.

const imports = {
	react: 'https://esm.sh/react@19.3.1',
	'react/': 'https://esm.sh/react@19.3.1/',
	'react-dom': 'https://esm.sh/react-dom@19.3.1',
	'react-dom/': 'https://esm.sh/react-dom@19.3.1/',
	graphiql:
		'https://esm.sh/graphiql@5.4.0?standalone&external=react,react-dom,@graphiql/react,graphql',
	'graphiql/': 'https://esm.sh/graphiql@5.4.0/',
	'@graphiql/react':
		'https://esm.sh/@graphiql/react@0.39.1?standalone&external=react,react-dom,graphql,@graphiql/toolkit,@emotion/is-prop-valid',
	'@graphiql/toolkit':
		'https://esm.sh/@graphiql/toolkit@0.12.1?standalone&external=graphql',
	graphql: 'https://esm.sh/graphql@17.0.2',
	'@emotion/is-prop-valid': 'data:text/javascript,',
}

/** A value written into a script, unable to close it. */
const inline = (value: unknown): string =>
	JSON.stringify(value).replaceAll('<', '\\u003c')

/** The page, served at `path`, that sends its documents to `path`. */
export function graphiqlPage(path: string): () => Response {
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UltimaBase GraphiQL</title>
<style>html,body,#graphiql{height:100%;margin:0}</style>
<link rel="stylesheet" href="https://esm.sh/graphiql@5.4.0/dist/style.css">
<script type="importmap">${inline({ imports })}</script>
<script type="module">
import React from 'react'
import ReactDOM from 'react-dom/client'
import { GraphiQL } from 'graphiql'
import { createGraphiQLFetcher } from '@graphiql/toolkit'
import 'graphiql/setup-workers/esm.sh'
const fetcher = createGraphiQLFetcher({ url: ${inline(path)} })
ReactDOM.createRoot(document.getElementById('graphiql')).render(
	React.createElement(GraphiQL, { fetcher }),
)
</script>
</head>
<body><div id="graphiql"></div></body>
</html>
`
	return () =>
		new Response(html, {
			headers: { 'content-type': 'text/html; charset=utf-8' },
		})
}
