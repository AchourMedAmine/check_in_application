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

# 3. Initialize database
npx prisma generate
npm run db:push

# 4. Start development server
npm run dev
# Visit http://localhost:3000
```

## 📱 How to Use

1. Pre-register participants with their QR codes in the database
2. Open the application
3. Use a barcode scanner or mobile device to scan QR codes
4. The scanner input field is always ready to receive scans
5. Only registered participants can be scanned
6. Each successful scan updates the attendance timestamp
7. View all scanned participants in the table below

## 🔌 API Endpoint

```
POST /api/scan
{
  "qrCode": "participant_qr_code"
}

Response (Success - Participant found):
{
  "success": true,
  "data": {
    "id": "...",
    "qrCode": "...",
    "name": "...",
    "email": "...",
    "scannedAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
}

Response (Error - Participant not found):
{
  "success": false,
  "error": "Participant not found. QR code not registered."
}
```

## 📊 Database Schema

```sql
CREATE TABLE participants (
  id          STRING PRIMARY KEY,
  qrCode      STRING UNIQUE NOT NULL,
  name        STRING,
  email       STRING,
  scannedAt   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt   TIMESTAMP
);
```

## 🛠️ Development

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build
npm start

# Database management
npm run db:push       # Sync schema
npm run db:migrate    # Create migration
npm run db:studio     # Prisma Studio
```

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
npx prisma generate

# Push schema to database
npm run db:push

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
