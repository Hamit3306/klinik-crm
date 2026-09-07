# Klinik Meta CRM v3.0

Clinic tracking system for the `@your_instagram_account` account that routes Instagram Lead Ads, Instagram DM, and WhatsApp Cloud API messages into a single CRM pool **without requiring any manual data entry**.

## Automatic Workflow

- Instagram ad form is filled → name, phone, email, form answers, and ad info are automatically saved.
- Instagram DM is received → Instagram user ID, username/name info, and the message are automatically saved.
- If a phone or email is written in the Instagram message, it is automatically detected.
- WhatsApp message is received → profile name, phone number, and message are automatically saved.
- If the same phone/email/Meta ID already exists, a second record is not created; the records are merged automatically.
- All messages appear in the **Message Inbox** screen sorted by their respective channels.

Clinic staff does not need to manually create patient cards. The manual registration screen is only for backup use.

## Important Platform Limit

WhatsApp webhook automatically sends the user's phone number. The Instagram DM webhook does not send the phone number; Instagram only provides the Instagram-scoped user ID and permitted profile info belonging to the messaging account. If the user writes their phone inside the DM, the system automatically extracts it from the text. If the person has previously filled out the Meta form with the same phone/email, the record is automatically merged.

## Features

- Instagram Lead Ads `leadgen` webhook integration
- Instagram Messaging API incoming/outgoing DM integration
- Auto-fetching Instagram user profile information
- Automatic extraction of phone and email from DM text
- WhatsApp Cloud API incoming/outgoing message integration
- Automatic matching with phone, email, WhatsApp ID, Instagram Scoped ID, and Meta Lead ID
- Auto-merging of duplicate contact records
- Unified message inbox for Instagram and WhatsApp
- Lead, campaign, and appointment relations
- SQLite centralized database
- Meta webhook signature verification and duplicate event prevention
- Secure server-side login and session management
- Three distinct simulations for local testing

## Requirements

- Node.js 22 or higher
- Publicly accessible HTTPS domain for live integration
- Meta Business Portfolio
- Professional Instagram Business/Creator account
- Linked Facebook Page and ad account
- WhatsApp Business Platform / Cloud API account
- Necessary Meta permissions and webhook subscriptions

## Quick Start

Extract the ZIP on Windows and run the `BASLAT.bat` file.

Via terminal:

```bash
npm install
cp .env.example .env
npm start
```

Browser:

```text
http://localhost:3001
```

Initial login:

```text
Username: admin
Password: klinik2026
```

Change the `ADMIN_PASSWORD` value before moving to production.

## Live Meta Connection

Detailed setup: [META_KURULUM.md](META_KURULUM.md)

Unified webhook address:

```text
https://crm.yourdomain.com/webhooks/meta
```

Separate alias addresses:

```text
https://crm.yourdomain.com/webhooks/leadgen
https://crm.yourdomain.com/webhooks/instagram
https://crm.yourdomain.com/webhooks/whatsapp
```

## Required `.env` Values

```env
APP_URL=https://crm.yourdomain.com
CORS_ORIGIN=https://crm.yourdomain.com

META_VERIFY_TOKEN=
META_APP_SECRET=
META_GRAPH_VERSION=v25.0
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=

INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_API_BASE=https://graph.instagram.com

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

INSTAGRAM_USERNAME=your_instagram_account
```

Do not write secret values in frontend files or push them to GitHub.

## Automated Test Flow

1. Log into the application.
2. Go to the **Meta Integration** page.
3. Run the Form Lead, Instagram DM, and WhatsApp Message tests respectively.
4. Since all three tests run with the same phone number, they merge into a single contact card.
5. In the **Message Inbox** screen, both Instagram and WhatsApp conversations will be visible.

## Database

```text
data/klinik.db
```

In production, an encrypted, automated backup transferred to a different server should be used.

## Project Structure

```text
public/              Admin panel
src/config.js        Environment settings
src/db.js            SQLite schema and auto migrations
src/auth.js          Session management
src/meta.js          Lead Ads + Instagram DM + WhatsApp integration
server.js            API and webhook server
data/                Database folder
```
