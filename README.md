# probashi-shield

## Supabase database

In the Supabase dashboard, open **Connect → Session pooler**. Add the connection string to `server/.env` as `DATABASE_URL` with the database password percent-encoded for use in a URL. Keep `JWT_SECRET` and `PORT` in the same file. The Express API connects to the private `probashi_shield` Postgres schema over verified TLS. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)

The server uses the included Supabase root CA bundle for Supabase hosts. You can point `sslrootcert` in `DATABASE_URL` to a replacement certificate when needed. [Supabase TLS documentation](https://supabase.com/docs/guides/platform/ssl-enforcement)

### Start a fresh demo

From `server`, run the initializer, seed the demo accounts, and start the API.

```sh
npm run db:init
npm run seed:users
npm run dev
```

### Move the existing MySQL data

Keep `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `server/.env` for the MySQL source. Pause writes to MySQL, then run these commands from `server` against an empty destination.

```sh
npm run db:init -- --schema-only
npm run db:migrate:mysql
npm run dev
```

The import copies the records, IDs, password hashes, and audit history. Users sign in again after switching to Postgres.
