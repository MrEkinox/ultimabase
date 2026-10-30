// The application: a GraphQL API over HTTP, whose posts hold files.
import { filesPlugin, memoryFiles, s3 } from '@ultimabase/files'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { allow, defineApp, memory } from 'ultimabase'
import { Post } from './models.ts'

//#region storage
// S3 or any S3-compatible storage in production; in memory otherwise, so
// neither the example's server nor its tests write to a real storage.
const storage =
	process.env.NODE_ENV === 'production'
		? s3({
				bucket: process.env.S3_BUCKET,
				region: process.env.S3_REGION,
				endpoint: process.env.S3_ENDPOINT,
				accessKeyId: process.env.S3_ACCESS_KEY_ID,
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
				// Spaces serves a public file only with a public-read ACL.
				publicAcl: true,
				// A CDN in front of the bucket; the storage's own URL without it.
				publicUrl: 'https://cdn.example.com',
			})
		: memoryFiles()
//#endregion

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	//#region plugins
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		// A signed-in user uploads by default; here, anyone.
		filesPlugin({ storage, access: { upload: allow.public } }),
	],
	//#endregion
	models: [Post],
})
