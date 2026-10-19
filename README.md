# Portfolio

## Footer stamp guestbook

Stamps are shared across all visitors and kept forever. They're stored in Upstash Redis
behind `api/stamps.js` (a Vercel serverless function, no dependencies).

**Setup (one time):**
1. Vercel dashboard → this project → Storage → Create → **Upstash for Redis** → connect it to the project.
   This adds `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) automatically.
2. Project → Settings → Environment Variables → add `STAMPS_ADMIN_TOKEN` set to a long random string.
3. Redeploy.

**Removing a stamp:** find its `id` from `https://<site>/api/stamps`, then:

```bash
curl -X DELETE -H "Authorization: Bearer $STAMPS_ADMIN_TOKEN" "https://<site>/api/stamps?id=<id>"
```

Limits: 5 stamps per IP per minute, 5,000 stamps total, city/country capped at 60 plain-text characters.
