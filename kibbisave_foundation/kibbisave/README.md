# KibbiSave — Backend Setup Guide

## Step 1: Set up Supabase (5 minutes)
1. Go to supabase.com and create a free account
2. Click "New Project" — name it "kibbisave"
3. Go to SQL Editor in your Supabase dashboard
4. Copy and paste the contents of `schema.sql` — click Run
5. Copy and paste the contents of `ledger.sql` — click Run
6. Go to Settings → API → copy your Project URL and keys into `.env`

## Step 2: Set up Africa's Talking (10 minutes)
1. Go to africastalking.com and create a free account
2. For testing: use the Sandbox environment (free, no real SMS)
3. Copy your API Key and Username into `.env`
4. To test: use the AT Simulator in their dashboard

## Step 3: Install and run
```bash
cd kibbisave
cp .env.example .env
# Fill in your values in .env
npm install
npm run dev
```

## Step 4: Test your first OTP
```bash
# Send OTP
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256771234567"}'

# Verify OTP (use the code from AT Simulator or your SMS)
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256771234567", "otp": "123456"}'
```

## What you have now
- Database schema: users, causes, groups, members, transactions, notifications
- Double-entry ledger: record_deposit, confirm_deposit, recalculate_rankings
- Auth API: send-otp, verify-otp, complete-profile
- Middleware: authenticateUser (protect any route)

## Next to build
1. Groups API — create group, join group, list groups
2. Deposit API — initiate deposit, Flutterwave webhook to confirm
3. Leaderboard API — read from leaderboard_view
