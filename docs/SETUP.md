# Paper Study deployment and storage

## Current checkpoint

The application and upload/processing pipelines are ready, but this environment has no Vercel CLI, project link, Blob token, or Notion integration. No PDF was downloaded or uploaded. The checked-in catalog is therefore a read-only snapshot of the repository metadata, not a fresh Notion query. Re-check Notion before running the uploader.

The snapshot contains 14 completed entries and BERT. `RL_1 Basic` is excluded because it is a topic rather than an identifiable paper. `RL_3 REINFORCE` remains excluded until the user confirms whether it means Ronald J. Williams' 1992 paper, *Simple statistical gradient-following algorithms for connectionist reinforcement learning*; do not upload a substitute.

## Vercel dashboard hand-off

> **Deploy the site commit, not the old default branch.** A Vercel log that says
> `Branch: main, Commit: b510d94` is building the repository before the Next.js
> application was added. That commit has no `package.json`, so changing the build
> command or Root Directory cannot fix the `No Next.js version detected` error.
> Push this feature branch and merge its pull request into `main` (recommended),
> or explicitly deploy the pushed feature branch as a Preview. A successful clone
> must show commit `aadedef` or a later commit containing `package.json`.

1. In Vercel, choose **Add New… → Project**, import `pepeking67/paper`, and use project name `paper-study`.
2. Set **Framework Preset** to **Next.js** and **Root Directory** to `./`, then deploy.
3. Open the project, choose **Storage → Create Database → Blob** (the dashboard may label this **Marketplace → Blob**), name it `paper-pdfs`, and select **Private** access.
4. Connect the store to `paper-study`. Confirm `BLOB_READ_WRITE_TOKEN` appears under **Settings → Environment Variables** for the required environments.
5. Pull environment variables locally with the Vercel CLI rather than copying token values into chat or files. Set `VERCEL_PROJECT_ID` in the local process before running the uploader.

### `No Next.js version detected`

1. Push `feat/paper-study-foundation` to GitHub and open a pull request into `main`.
2. Merge the pull request; verify that GitHub `main` now contains the root-level
   `package.json` whose dependencies include `next`.
3. In Vercel, open **Project → Settings → Build and Deployment** and keep Root
   Directory as `./`. Do not add a custom Build Command or `vercel-build` script.
4. Open **Deployments**, select the failed deployment, and choose **Redeploy**
   without the build cache. Confirm the new log clones the merged commit rather
   than `b510d94`.

If the branch cannot be pushed from the current machine, authenticate GitHub in a
trusted local terminal first. Never paste a GitHub token into chat.

Afterward, report only that the project and private store are connected (plus project/team names); never send secret values. Run `npm run upload-papers` only after a fresh read-only Notion check confirms the target set. The uploader validates the PDF signature and arXiv redirect ID, hashes content, uploads privately without random suffixes, and checkpoints each result in `data/papers.manifest.json`.

## Processing and retrieval boundary

Run `npm run process-pdfs -- VLA_4 /temporary/path/OpenVLA.pdf`. It produces `document.json`, page text, and `chunks.jsonl` under `data/processed/VLA_4/`. Generated extraction is ignored by default: review its size and quality flags before deciding whether to version it. The chat provider receives only a paper ID, current page, optional selected text, and selected chunks; it never accepts an entire PDF.

The private-PDF API accepts an allow-listed paper ID only, resolves its pathname exclusively from the manifest, validates the pathname, and streams the private Blob through the server. It deliberately does not expose Blob URLs or listing operations. Whole-file streaming is used initially for reliable PDF.js loading; range forwarding can be added at the Blob adapter boundary after integration testing against the connected store.

## Administrator PDF synchronization

With `BLOB_READ_WRITE_TOKEN` configured, open the deployed site and choose **PDF 관리**
at the bottom left. **누락된
PDF 동기화** checks and uploads allow-listed papers with at most two browser requests
in flight. Excluded entries are displayed but never submitted. The POST API processes
only one `paperId`; it obtains both source URL and destination pathname from the
checked-in manifest, enforces same-origin mutation requests, download timeout,
PDF content/signature and size checks, arXiv identity, and private no-overwrite upload.

The manifest remains an immutable allowlist at runtime. An exact-path match from a
server-only, prefix-limited Blob `list()` query is the
source of truth for availability. The MVP returns SHA-256 and size to the administrator
screen but does not persist them: they are not needed for serving, and adding a database
or a second metadata Blob would add consistency and lifecycle complexity. A persistence
adapter can be introduced later without changing `syncPaper()`.

The application no longer implements a site password or HTTP Basic authentication.
For non-public administration, enable Vercel Deployment Protection or restrict access
at the hosting layer. Same-origin validation mitigates browser CSRF, but is not a user
authentication mechanism.

PDF.js runs its worker from the same deployment at `/pdf.worker.min.mjs`. The
`predev` and `prebuild` scripts copy the version bundled with the installed
`pdfjs-dist` package into `public/`; the generated worker is intentionally ignored by
Git so its version cannot drift from the package installed during deployment.

The PDF viewer renders both a canvas and PDF.js text layer, so selected text and
the extracted current-page text can become question context. A ChatGPT Plus
subscription cannot authenticate an embedded API client or pay for OpenAI API usage.
The **ChatGPT Plus로 질문** action therefore copies the bounded page context and opens
`chatgpt.com`; embedded answers remain behind the provider-neutral API boundary until
the owner separately chooses and configures an API provider.
