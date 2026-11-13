// What `ultimabase dev` and `ultimabase start` run: Sentry first, so that it
// sees each request, then the application.
//#region config
await import('./src/instrument.ts')
const { app } = await import('./src/app.ts')

export default app
//#endregion
