import { honoServerPlugin } from '@ultimabase/server-hono-plugin'

export const server = honoServerPlugin({ host: '127.0.0.1', port: 1337 })
