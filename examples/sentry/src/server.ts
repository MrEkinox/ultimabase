//#region server
// `yarn start`: Sentry first, so that it sees each request, then the
// application, served until it is stopped.
await import('./instrument.ts')
const { app } = await import('./app.ts')

await app.start()
//#endregion
