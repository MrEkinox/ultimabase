# Preset `@ultimabase/api-server` (2026-10-09)

Conclusion de la revue des transports, à la demande de l'utilisateur : lancer
REST et GraphQL sans déclarer sept paquets un par un. Validé le 2026-10-09
(option 1 ; ADR à la création du paquet).

```ts
export const App = UltimaBase.use(
	postgresPlugin(),
	...apiServer({ rest: true, graphql: true }),
)
```

- `apiServer()` renvoie seulement une liste de plugins, sans code caché :
  `[httpPlugin(), restPlugin(), graphqlPlugin(), graphqlYogaPlugin(),
honoServerPlugin()]` selon les options ; remplaçable par les plugins un par
  un.
- Options transmises : `rest`, `graphql`, `http`, `server`
  (`apiServer({ rest: { openapi: true }, http: { browser: { origins } }, server: { port } })`).
- Un seul paquet à installer pour la partie API, versions alignées ; les
  plugins restent installables séparément ; aucun plugin ne dépend d'un autre
  à cause du preset.
- Plus tard, si la demande existe : un paquet unique `ultimabase` qui
  réexporte tout (option 2, non exclusive).
