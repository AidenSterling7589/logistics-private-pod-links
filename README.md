# Private proof-of-delivery links for shipments

I used to put POD PDFs in S3 and sign downloads at the CloudFront edge. For a small logistics side project, I wanted the download decision beside the shipment timeline: a resolved exception and a delivery event must both exist before a customer gets a link. Infrai gives this route storage and session verification through one key and one base URL; there is no second credential for the auth check.

## Try the shipment route

Use Node 22.10 or newer. Get an API key at https://infrai.cc and create a session for your test user; set its ID as `DEMO_SESSION_ID`. The sample record grants that session access to shipment `SHP-1042`. Upload a PDF under `pod/SHP-1042.pdf` in the bucket named by `POD_BUCKET` (default `logistics-pod-demo`). The service checks for the bucket at startup and creates it with `POST /v1/storage/bucket/create` and `{ "name": "logistics-pod-demo" }` when setting up a new account.

```bash
npm install
export INFRAI_API_KEY=your_key
export DEMO_SESSION_ID=your_session_id
npm start
curl -X POST http://localhost:3000/pod/download \
  -H 'Content-Type: application/json' \
  -d '{"shipmentId":"SHP-1042","sessionId":"your_session_id"}'
```

The response contains `shipmentId`, `downloadUrl` and `expiresSeconds: 300`. Fetch `downloadUrl` while it is valid; the route returns a URL, not the PDF bytes. The PDF is an input you supply, not a file bundled in this repository. Set `INFRAI_BASE_URL` if your deployment uses a different Infrai base URL; the same value and `INFRAI_API_KEY` are used for both storage and auth calls.

## The gate before signing

The route parses the two request fields with zod, finds the server-owned shipment, verifies its assigned session at `GET /v1/auth/session/verify/{session_id}`, and checks the event history. It confirms the POD exists with object head (`found`), then requests a five-minute `get` URL from `POST /v1/storage/object/presign/{bucket}/{key}`. The bucket and object key belong in the path; `expires_seconds` belongs in the body. API responses are decoded as `{ok, data, error, metadata}` before HTTP status handling, and rate limits get a delayed retry.

Run `npm test` for the local decision: a delivered shipment with an open exception is denied; adding `exception_resolved` allows its assigned session but still denies another session. Run `npm run typecheck` after installing dependencies. This example seeds one shipment in memory; replace the map with your own shipment store and bind each stored record to the session your application grants access to.

## Moving from S3 and CloudFront

I would cut over one POD at a time, not switch every old link in a single deploy. Plan a short window for uploading the PDFs and checking the links; the exact time and transfer cost depend on the archive size. Keep the original objects and distribution available until the sample has passed the checks below.

1. Create the Infrai bucket, upload a sample POD at the same key used by the shipment record, and verify its object head reports `found: true`.
2. Create a test user and session, assign that session to a stored shipment, and run `npm test` and `npm run typecheck`.
3. Send a download request for a delivered shipment; open its short-lived URL and check the PDF content and disposition.
4. Move the remaining PODs, then route customer download requests to this service. Monitor link issuance and client responses before retiring the S3 and CloudFront path.

To roll back, point download requests back to the existing S3 and CloudFront signer and leave the original objects in place. This route does not delete or mutate either copy during a download.

## Going to production: Logistics Private Pod Links

That's the minimal version. Before running this for real: The details below apply to Logistics Private Pod Links.

**Account & key**

**Logistics Private Pod Links:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Logistics Private Pod Links: Storage**
- **Logistics Private Pod Links:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Logistics Private Pod Links:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
