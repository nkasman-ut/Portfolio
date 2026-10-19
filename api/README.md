# Stamp guestbook backend

`api/stamps.js` is a zero-dependency Vercel Serverless Function that stores the
shared "Leave a stamp" wall in an Upstash Redis list.

- `GET /api/stamps` → `{ stamps: [ { city, country, seed, x, y, rot, ts }, … ] }`
- `POST /api/stamps` with `{ city, country, seed, x, y, rot }` → validates and appends

Only structured, validated fields are stored — never raw SVG/markup — and the
place is re-checked server-side against Open-Meteo, so a direct POST can't inject
markup or fake a nonexistent location. The page rebuilds the stamp artwork from
these fields with its own trusted code.

## One-time setup (Vercel)

1. In the Vercel dashboard for this project: **Storage → Create Database → Upstash for Redis**
   (Marketplace), and connect it to the project.
2. That automatically adds the env vars the function reads:
   `KV_REST_API_URL` / `KV_REST_API_TOKEN`
   (the older `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` names are also accepted).
3. **Redeploy.** The footer now reads and writes the shared wall automatically.

No `package.json` or build step is needed — the function uses only the Node
runtime's built-in `fetch`.

## Before it's configured

If the env vars are missing (or you're viewing the page from `file://` / a preview),
`GET`/`POST` fail gracefully and the page falls back to `localStorage`, so the wall
still renders per-browser. Configure the store to make it shared and durable.

## Notes / possible follow-ups

- **Abuse:** the endpoint is public (that's the point of a guestbook). It caps
  stored stamps (`MAX_STAMPS`), restricts field sizes/charset, and requires a real
  place. A per-IP rate limit could be added later if spam becomes an issue.
- **Scale:** the whole list is returned on load, which is fine for a personal site.
  If it ever grows large, page it server-side.
