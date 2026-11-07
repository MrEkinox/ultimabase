// The contract on the first server `TEST_DATABASE_URL` lists (D-98), in a
// file of its own so that it runs beside postgres.postgres.test.ts, which
// passes it on the others.
import { conformance, urls } from './test/servers.ts'

const [first = ''] = urls
conformance(first)
