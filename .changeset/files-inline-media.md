---
'@ultimabase/files': patch
---

Only images, audio, video and PDF are served inline. An SVG with an XML prolog, or an XHTML document, was detected as `application/xml` and served inline, so its script ran when the file was opened from S3; it is now served as a download, as every other type is.
