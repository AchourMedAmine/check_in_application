# QR Code Participant Scanner

A simple, fast QR code scanner for registering participant attendance. Built with Next.js, React, and PostgreSQL on Supabase.

## ✨ Features

- 📱 **QR Code Scanning** - Scan participant QR codes instantly
- 📊 **Live Statistics** - View total scanned, named, and emailed participants
- 🎯 **Real-time Feedback** - Instant confirmation on each scan
- 💾 **Database Storage** - All scans persist in PostgreSQL
- 🌓 **Dark Mode** - Comfortable viewing in any lighting
- ⚡ **Fast & Lightweight** - Minimal dependencies, maximum speed

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Supabase account (free at https://supabase.com)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase DATABASE_URL

# 3. Generate the Prisma client + create the check-in tables
npm run db:generate
npm run db:apply prisma/sql/001_checkin_schema.sql
npm run db:sessions

# 4. Start development server
npm run dev
# Visit http://localhost:3000
```

## 📱 How to Use

1. Open the application — it shows the currently open session and its progress
2. Scan with the **camera** (needs HTTPS or localhost) or the **keyboard** mode
   (USB/Bluetooth barcode scanner, or paste an id and press Enter)
3. Badges are not printed yet, so the QR content is the participant's `id`
4. Each new scan creates a check-in; re-scanning shows "already checked in"
5. "Not yet checked in" lists everyone still missing from the mandatory session

## 🔌 API

```
POST /api/scan
{ "qrCode": "<participant id>", "sessionId"?: "...", "stationId"?: "door-A" }
→ { participant, session, presence, alreadyCheckedIn, stats }

GET  /api/sessions                      → sessions with attendance stats
GET  /api/sessions/[id]/attendance      → { checkedIn[], missing[], stats }
GET  /api/scan                          → all participants (testing helper)
```

Scanning the same badge twice is harmless: the second scan returns the existing
record with `alreadyCheckedIn: true` instead of creating a duplicate.

## 📊 Database

Two Postgres schemas:

- **`public`** — owned by the TRSYP website. This app only *reads*
  `participants` (joined to `users` for name/lastName via `user_id`).
- **`checkin`** — owned by this app: `sessions` and `presences`. No foreign
  keys point into `public`, so the website's migrations and ours never collide.

```
checkin.sessions   id, title, location, starts_at, ends_at, mandatory,
                   break_allowance_minutes, penalty_points, status
checkin.presences  id, participant_id, session_id, check_in_at, check_out_at,
                   station_id
```

A participant may have several `presences` rows per session (they can step out
and return). A partial unique index guarantees at most one *open* interval
(`check_out_at IS NULL`) per participant per session.

## 🎟️ Sessions

Scans are recorded against the session whose `status` is `Open`. Edit
`prisma/seed-sessions.ts` and run `npm run db:sessions` to add sessions or
change which one is open. The Opening Ceremony is `mandatory`, so every
participant is expected and the UI lists whoever has not checked in yet.

## 🛠️ Development

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build
npm start

# Database
npm run db:generate                # regenerate the Prisma client
npm run db:apply <file.sql>        # run a SQL file on the `checkin` schema
npm run db:sessions                # create/update the sessions
npm run db:studio                  # Prisma Studio
```

> ⚠️ **Never run `prisma migrate` or `prisma db push` from this repo.** The
> database belongs to the TRSYP website and its schema only has `Participant`
> and `User` mapped — Prisma would try to drop every other table. All schema
> changes here are hand-written SQL in `prisma/sql/`, applied with `db:apply`.

## 🚢 Deployment

### Deploy to Vercel

```bash
git push origin main
# Vercel auto-deploys from GitHub
```

### Deploy with Docker

```bash
docker build -t qr-scanner .
docker run -p 3000:3000 -e DATABASE_URL="..." qr-scanner
```

## 📋 Files Structure

```
app/
  ├── page.tsx              # Main scanner page
  ├── layout.tsx            # App layout
  ├── globals.css           # Global styles
  └── api/
      └── scan/
          └── route.ts      # QR scan endpoint

components/
  ├── QRScanner.tsx        # Scanner input component
  └── ScannedParticipants.tsx  # Participants table

hooks/
  ├── useFetch.ts          # Generic fetch hook
  └── useScannedParticipants.ts  # Participants data hook

lib/
  ├── db.ts                # Prisma client
  ├── api-handler.ts       # API response wrapper
  ├── types.ts             # TypeScript types
  └── errors.ts            # Custom error classes

prisma/
  └── schema.prisma        # Database schema
```

## 🔧 Configuration

### Environment Variables

```
DATABASE_URL="postgresql://user:password@host:5432/database"
NODE_ENV="production"
NEXT_PUBLIC_API_URL="https://your-domain.com"
```

## 🆘 Troubleshooting

**Scanner not working?**
- Ensure input field is focused (click on it)
- Check that barcode scanner is properly configured
- Try pasting a test QR code value

**Database connection error?**
- Verify DATABASE_URL is correct
- Check Supabase project is active
- Ensure your IP is whitelisted in Supabase

**Build fails?**
```bash
# Regenerate Prisma client
npm run db:generate

# Try building again
npm run build
```

## 📚 Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma

## 📝 License

MIT License

## 🤝 Support

- Check [SETUP.md](./SETUP.md) for detailed setup instructions
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- Visit [Supabase Docs](https://supabase.com/docs)
- See [Next.js Docs](https://nextjs.org/docs)

---

**Ready to scan?** Start with `npm install && npm run dev`
