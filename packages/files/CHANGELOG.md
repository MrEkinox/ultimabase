# @ultimabase/files

## 0.8.0

### Minor Changes

- 5253dde: `files.refresh('Post.cover', { as: master })` gives the files stored before a key was added to `inline` or `variants` that key: it runs only the missing functions on each body, stores the values and variants as an upload does, and writes the file again in its row without the model's hooks, keeping `updatedAt`, so live reads see it. It returns `{ refreshed, failed }`; a file whose body is gone or whose row changed meanwhile is in `failed`, and the next call takes it again.

### Patch Changes

- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [458361b]
- Updated dependencies [4c9e506]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [1520a09]
  - ultimabase@0.8.0
  - @ultimabase/http@0.8.0

## 0.7.0

### Patch Changes

- 1f34e7a: A declared `Content-Type` that is no media type is stored as `application/octet-stream`.
- 1f34e7a: Deleting a row that holds no file no longer queries `FilesBlob`.
- 1f34e7a: `diskFiles()` deletes at start the temporary files a crash left, an hour old.
- 1f34e7a: Only images, audio, video and PDF are served inline. An SVG with an XML prolog, or an XHTML document, was detected as `application/xml` and served inline, so its script ran when the file was opened from S3; it is now served as a download, as every other type is.
- 1f34e7a: `files.check({ delete: true })` on `s3()` deletes only objects files wrote. It listed the whole bucket, so it deleted every other object in it, a backup next to the uploads included; `s3()` now lists only `public/` and `private/` keys.
- 1f34e7a: The sweep reads released files 500 at a time and deletes 16 objects at a time, so a sweep after a mass delete no longer sends every deletion at once. A refused deletion keeps only its own row: the rows of the objects deleted are deleted.
- 1f34e7a: A private file's URL is signed three times faster: the SigV4 signing key is derived once a day.
- 1f34e7a: An upload checks `access.upload` before anything else, and answers a refused caller 403 `The upload is refused.` whatever field it names. The rule ran once the body was read, so an anonymous caller had the server buffer up to `maxSize` of a field with variants, learned from 400 and 415 answers which fields exist, and got a 403 that named the internal `FilesBlob` model.
- 1f34e7a: An upload with variants writes two `FilesBlob` rows at most, and none when a variant or an inline value fails.
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
  - ultimabase@0.7.0
  - @ultimabase/http@0.7.0

## 0.6.0

### Patch Changes

- a4e42fe: A file's `id` is an `ID` in GraphQL, as every id, and `{ type: 'string', format: 'uuid' }` in OpenAPI: it was a `String`. A client passing a file's id in a variable declares `$id: ID!`.
- f2d695a: `diskFiles()` reads an upload 1 MiB ahead and writes it 1 MiB at a time, so a 5 MB upload runs at 525 to 560 MB/s instead of 391 to 444 MB/s, and a 200 MB one at 1045 to 1100 MB/s instead of 771 to 856 MB/s.
- Updated dependencies [e97378e]
- Updated dependencies [778bbbc]
- Updated dependencies [2bccedd]
- Updated dependencies [f808da8]
- Updated dependencies [a47bbc4]
- Updated dependencies [7c20553]
- Updated dependencies [2f1baf1]
- Updated dependencies [945b1b3]
- Updated dependencies [4ff9d42]
- Updated dependencies [41b5dca]
- Updated dependencies [3d7f654]
- Updated dependencies [703ed93]
- Updated dependencies [76509c3]
- Updated dependencies [a6394ba]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [ce7e68f]
- Updated dependencies [d6ec5d4]
- Updated dependencies [0a6de4d]
- Updated dependencies [1644bb1]
- Updated dependencies [dfa430e]
- Updated dependencies [12edcfd]
- Updated dependencies [a479bca]
- Updated dependencies [0102aa8]
- Updated dependencies [7a8d0d8]
- Updated dependencies [e3d051f]
- Updated dependencies [6140b2b]
- Updated dependencies [0699e37]
  - ultimabase@0.6.0
  - @ultimabase/http@0.6.0

## 0.5.0

### Minor Changes

- afa0568: `@ultimabase/files/client` uploads files from a browser: `uploader({ url,
headers })` gives `upload(file, { for })`, which resolves to the id to write
  in a row, or `upload(files, { for })` for a list. A refused upload rejects
  with a `FileError` carrying the server's `code`, `message` and `details`. It
  imports nothing of the server, whose packages become optional peers.

### Patch Changes

- 95a0c1f: `s3({ publicUrl })` takes `undefined`, as the other options read from the
  environment do: `publicUrl: process.env['S3_PUBLIC_URL']` type-checks, and
  `undefined` keeps the storage's own URL.
- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0
  - @ultimabase/http@0.5.0

## 0.4.0

### Minor Changes

- 7accc26: Each plugin declares the codes its errors carry in its types' `errors`, and `ultimabase` exports `ErrorCodeOf<typeof app>`: the kernel's codes and those of each plugin the application lists, for a client to type its messages against (D-206). A GraphQL document the schema refuses, as an unknown field, now carries `extensions.code: 'BAD_USER_INPUT'`, as REST's refused query.
- 1d37bc8: `diskFiles({ dir, secret })` stores the files in a directory, for one server with a persistent volume, and `memoryFiles()` now gives real URLs: the application serves both at `GET /files/<key>`, a private file at a signed URL, sandboxed and never sniffed (D-202).

### Patch Changes

- 1d7fda8: `ultimabase` exports `QueryOptions`, the `{ as }` every query, model command
  and `fn.run` take; auth, files and password use it instead of their own
  copies.
- 08e0dec: A private file's URL stays the same for 15 minutes: `s3()` signs it with the start of its 15-minute window and an expiry of 30 minutes, so a row read again, as a live read resends it, keeps its URLs (D-200).
- Updated dependencies [67d5152]
- Updated dependencies [9c6ca70]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4fba06b]
- Updated dependencies [4e1a966]
- Updated dependencies [6e7d759]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [9cebf63]
- Updated dependencies [b65eb74]
- Updated dependencies [1354efd]
- Updated dependencies [b994e6e]
- Updated dependencies [fb807e1]
- Updated dependencies [69699b2]
- Updated dependencies [4b37376]
- Updated dependencies [d76e882]
- Updated dependencies [ebdf8a0]
- Updated dependencies [b5c22b0]
- Updated dependencies [1d7fda8]
- Updated dependencies [a778695]
- Updated dependencies [adafb1a]
- Updated dependencies [2afc370]
- Updated dependencies [e61e1c2]
- Updated dependencies [844627a]
- Updated dependencies [eb6dbbf]
- Updated dependencies [c9a8228]
- Updated dependencies [501c0cb]
- Updated dependencies [644a24f]
- Updated dependencies [efc4303]
- Updated dependencies [6c1cfe5]
  - ultimabase@0.4.0
  - @ultimabase/http@0.4.0

## 0.3.0

### Minor Changes

- 935c507: `filesPlugin({ maxSize })` is the largest file of every file field that sets no `maxSize`, 50 MB by default; a field's own `maxSize` may be larger or smaller (D-152).

### Patch Changes

- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [1195207]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [b06627c]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [2eb7b9d]
- Updated dependencies [a7588c3]
- Updated dependencies [aaf123c]
- Updated dependencies [714d3bb]
  - ultimabase@0.3.0
  - @ultimabase/http@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2c3bf4e]
- Updated dependencies [fd1263e]
  - ultimabase@0.2.0
  - @ultimabase/http@0.2.0

## 0.1.2

### Patch Changes

- @ultimabase/http@0.1.2
  - ultimabase@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - ultimabase@0.1.1
  - @ultimabase/http@0.1.1

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.

### Patch Changes

- Updated dependencies [0e885c4]
  - @ultimabase/http@0.1.0
  - ultimabase@0.1.0
