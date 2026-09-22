# for her — a private space for two

A full-stack private couples application designed for exactly one girlfriend and one boyfriend. It combines sensitive, consent-controlled cycle context with moods, check-ins, cravings, shared notes, memories, notifications, and silent one-to-one WebRTC calls.

It deliberately avoids medical claims: every cycle projection is marked as an estimate based on saved history, and no health diagnosis or advice is provided.

## What is included

- Secure two-account authentication: bcrypt password hashes, JWTs, HTTP-only session cookie support, protected routes, login rate limiting, Helmet, CORS, validation, and Prisma parameterized queries.
- A responsive React application with desktop sidebar, mobile navigation, dark mode, keyboard focus styles, loading/empty/error states, Framer Motion interactions, and a warm wine/cream/lavender visual system.
- Girlfriend-led cycle tracking with history, average lengths, period calendar, timeline, and explicit estimate-only wording.
- Private sharing controls for cycle information, estimates, mood, check-ins, cravings, and notes.
- Real-time mood, check-in, craving, quick action/Miss You, note, timeline, memory, and notification events over an authenticated Socket.IO couple room.
- Craving status workflow: requested, accepted, ordered, completed, or declined.
- Authenticated relationship-photo uploads. Files are not served as a public static folder; the download route verifies couple membership first.
- Silent WebRTC call invitations, accept/decline flow, offer/answer/ICE signaling, media created only after acceptance, mute, camera state, camera switching where supported, call state UI, and metadata-only call history. The Node server never carries or records audio/video.

## Architecture

```text
client/                 React + Vite + TypeScript + Tailwind + Framer Motion
  src/context/          Auth, Socket.IO, and WebRTC call state
  src/pages/            Feature pages and responsive views
server/                 Express + Socket.IO + Prisma
  src/routes/           Protected REST endpoints
  src/services/         Couple and notification concerns
  src/socket/           Authenticated private-room signaling
  prisma/schema.prisma  MySQL data model
```

## Local setup

Prerequisites: Node.js 20+ and MySQL 8+. Docker Desktop is optional for the included MySQL service.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and replace every placeholder, particularly `DATABASE_URL`, `JWT_SECRET`, and both one-time account passwords. Never commit `.env`.

3. Start MySQL. With Docker:

   ```bash
   docker compose up -d mysql
   ```

4. Create the schema and Prisma client:

   ```bash
   npm run db:generate
   npm run db:migrate -- --name init
   ```

5. Provision exactly the two private accounts. The seed refuses to run until all four email/password values are set in `.env`:

   ```bash
   npm run prisma:seed -w server
   ```

6. Start both applications:

   ```bash
   npm run dev
   ```

   Open `http://localhost:5173`. The API runs on `http://localhost:4000`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and Vite client together |
| `npm run build` | Type-check and build both apps |
| `npm run test` | Run unit tests |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate -- --name init` | Create/apply a development migration |
| `npm run prisma:deploy -w server` | Apply committed migrations in production |
| `npm run prisma:seed -w server` | Create/update the two private accounts from environment variables |

## Environment variables

`DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`, and `SERVER_PORT` are required server configuration. `STUN_SERVER` defaults to a public development STUN service. For production, set all `TURN_*` values to a credentialed TURN deployment—do not hardcode TURN credentials. `MAX_UPLOAD_BYTES` defaults to 5 MB.

For production, use a long random `JWT_SECRET`, HTTPS, a production MySQL database, a persistent private upload volume or object store, and an explicit `CLIENT_URL`. When the web client and API use unrelated sites (for example, a default Vercel domain plus a default Render domain), proxy them through a same-site custom domain or adapt the cookie policy deliberately; do not loosen CORS to `*`.

## WebRTC notes

`getUserMedia` requires HTTPS except on localhost. Calls work best with a TURN server in real networks, because STUN alone cannot traverse every NAT/firewall. The signaling server validates Socket.IO JWTs, joins only `couple:<coupleId>` rooms, and validates that both users belong to the call before forwarding signaling messages.

There is intentionally no ringtone, vibration, notification audio, auto-answer, auto-camera, or auto-microphone behavior. Either side must select **Accept** before local media is requested. Browser support for choosing an audio output varies; the interface handles unsupported camera switching without failing the call.

## Security and privacy notes

- Public registration does not exist. The seed flow provisions the only two roles, which are unique in the database.
- Passwords are only bcrypt hashes. They are never selected or returned by API responses.
- REST routes, Socket.IO connections, private image fetches, and call signaling check authentication and couple membership.
- Rate limiting applies to auth attempts; request bodies and uploads have explicit size and type limits.
- Photos are stored privately and fetched through an authenticated route. Use encrypted object storage in a multi-instance production deployment.
- Calls retain caller/receiver/status/timing metadata only. No media is transmitted through or recorded by the backend.

## Verification

The project includes cycle-estimate unit tests. Before release, run the build and add integration tests against an isolated MySQL instance for login/authorization, privacy gating, uploads, Socket.IO authorization, and WebRTC signaling. Test camera and audio-output behavior on the target mobile browsers as browser permissions and output-device capabilities vary.
