# Payload CMS POC — Session Handoff

> Date: 2026-06-17
> Project: apir-tayo (High6 Corporation)
> Author: Kiyan

---

## Background & Context

The supervisor (Sir Jeff) tasked an exploration of **Payload CMS** as a potential headless CMS solution for apir-tayo and future client projects. The broader objective is to evaluate a multi-tenant CMS architecture where clients can manage content through an AI agent via voice/text commands — without ever touching the backend directly. The agent handles the changes with guardrails restricting what can be modified.

A parallel task was also assigned to **Sir Gio**, who is evaluating **WordPress Multisite (IWP)** on his end. Both are running independent POCs to compare the two approaches.

**Clarifications still needed (to raise with Sir Jeff in EOD):**
- Is Sir Gio's POC separate or should both POCs eventually connect?
- Is there a deadline for this exploration?
- Is there an existing agent/AI setup at High6 to build on, or starting from scratch?

---

## What Was Accomplished This Session

- ✅ Decided on approach: **local-only POC** in a separate folder (`~/work/payload-poc`), not a branch of apir-tayo
- ✅ Created a **MongoDB Atlas** free cluster (`payload-poc`) and configured network access (`0.0.0.0/0` for local dev)
- ✅ Scaffolded a fresh Payload CMS project using `npx create-payload-app@latest`
  - Template: **website**
  - Database: **MongoDB**
  - Package manager: **pnpm**
- ✅ Resolved pnpm version conflict (system had v11.5.0, Payload requires `^9 || ^10`) by running `npm install -g pnpm@10`
- ✅ Connected Payload to MongoDB Atlas successfully
- ✅ Seeded the database with sample content (pages, posts, media)
- ✅ Confirmed frontend at `http://localhost:3000` pulls content from Payload
- ✅ Admin panel accessible at `http://localhost:3000/admin`

---

## Project Location

```
~/work/payload-poc/
```

---

## How to Run the Project Again

```bash
cd ~/work/payload-poc
pnpm dev
```

Then open:
- Frontend: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`

---

## MongoDB Atlas Details

- Cluster name: `payload-poc`
- DB user: `joshsosme_db_user`
- Connection string is already saved in `.env` inside the project as `DATABASE_URI`
- Network access: `0.0.0.0/0` (open for local dev — restrict before any deployment)

---

## Environment Variables (`.env`)

Located at `~/work/payload-poc/.env`. Should contain:

```env
DATABASE_URI=mongodb+srv://joshsosme_db_user:<password>@payload-poc.nxpvmoj.mongodb.net/?appName=payload-poc
PAYLOAD_SECRET=<your-secret>
```

---

## Next Things to Explore

### 1. Multi-tenancy
Test Payload's ability to serve multiple clients/frontends from one CMS instance.
- Read: [Payload Multi-Tenant Plugin](https://payloadcms.com/docs/plugins/multi-tenant)
- Goal: Simulate two different "clients" with separate content spaces under one Payload instance

### 2. Image Storage
Connect Payload's media/uploads to cloud storage (e.g. AWS S3 or Cloudflare R2).
- Read: [Payload Cloud Storage Plugins](https://payloadcms.com/docs/plugins/cloud-storage)
- Goal: Test guardrails — allowed file types, size limits, folder restrictions per tenant

### 3. Content API Test
Verify the REST and/or GraphQL API that the Next.js frontend would consume.
- REST: `http://localhost:3000/api/<collection-slug>`
- GraphQL: `http://localhost:3000/api/graphql`
- Goal: Fetch content from Payload in a Next.js page (simulating how apir-tayo would consume it)

### 4. Agent Concept POC
Build a basic agent that accepts plain-language commands and calls the Payload API to make content changes.
- Goal: Client says "change the hero headline to X" → agent calls Payload API → content updates
- Guardrails: Define what fields/collections the agent is allowed to modify

### 5. Align with Sir Gio
Compare findings from Payload POC vs WordPress Multisite POC once both have results.

---

## How This Relates to apir-tayo

The current apir-tayo stack (`/home/projects/apirtayo` on the VPS) uses:
- WordPress/Gravity Forms as the headless backend for contact form handling
- No CMS — all content is hardcoded in the Next.js components

If Payload proves out, the eventual integration path for apir-tayo would be:
1. Replace hardcoded content in components with API calls to Payload
2. Replace WordPress/Gravity Forms contact form backend with Payload's form builder or a custom collection
3. Connect Payload to the existing Next.js frontend (apir-tayo) as a separate service
4. Build the agent layer on top of Payload's API

**Important:** Payload would be a separate service from the Next.js app — not installed inside the apir-tayo repo. It would run on its own port/subdomain and the Next.js frontend would fetch from it.

---

## Key Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Branch vs separate repo vs local | Local only for now | POC phase, nothing to deploy yet |
| Copy apir-tayo or start fresh | Start fresh | Payload is a new backend, not a feature of apir-tayo |
| Database | MongoDB Atlas (free tier) | No local MongoDB, Atlas is free and fast to set up |
| Template | Website | Most complete, closest to apir-tayo's use case |
| When to create a repo | After local POC validates | No point setting up CI/CD before concept is proven |

---

## Resources

- [Payload Docs](https://payloadcms.com/docs/getting-started/what-is-payload)
- [Payload GitHub](https://github.com/payloadcms/payload)
- [MongoDB Atlas](https://cloud.mongodb.com)
- [Payload Multi-Tenant Plugin](https://payloadcms.com/docs/plugins/multi-tenant)
- [Payload Cloud Storage](https://payloadcms.com/docs/plugins/cloud-storage)
