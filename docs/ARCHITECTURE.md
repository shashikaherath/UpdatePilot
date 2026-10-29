# UpdatePilot — Architecture & Engineering Guide

## 1. System Overview

UpdatePilot is a Windows software-update management platform providing:
1. **Application Discovery & Inventory**: Discovers software installed across paired Windows machines.
2. **Update Intelligence**: Correlates detected applications with trusted package identities (WinGet), detects available updates, and highlights verified security advisories.
3. **Safe, User-Confirmed Updates**: Enforces explicit human confirmation through one-time preview tokens before execution.
4. **Post-Update Verification**: Distinguishes installation exit codes from actual version verification outcomes.
5. **Historical Auditing & Reporting**: Preserves scan snapshots and update lifecycle records with sanitized CSV export.

---

## 2. Logical Components

```
+---------------------------------------------------------------+
|                      Web Dashboard (Next.js)                   |
|               Session Cookie (HttpOnly, SameSite)             |
+------------------------------+--------------------------------+
                               | HTTPS /api/v1/*
                               v
+---------------------------------------------------------------+
|                    UpdatePilot Backend API                    |
|  - Auth & Sessions           - Application Inventory          |
|  - Device Management         - Update Preview & Idempotency   |
|  - Job Orchestration Engine  - History & CSV Reporting        |
|  - Centralized Error Handler - OpenAPI Documentation          |
+-----------------+----------------------------+----------------+
                  |                            |
  HTTPS /agent/v1 | Device Bearer Token        | Prisma ORM
                  v                            v
+-----------------------------+   +-----------------------------+
|    Windows Agent (WinGet)   |   |   PostgreSQL 18 Database    |
| - Local Software Discovery  |   | - 18 Tables                 |
| - Constrained Operations    |   | - UTC Timestamps            |
| - Version Verification      |   | - Hashed Tokens Only        |
+-----------------------------+   +-----------------------------+
```

---

## 3. Database Model & Entities

The database schema is implemented in `prisma/schema.prisma` and versioned through Prisma migrations:

| Entity | Purpose | Key Constraints |
| :--- | :--- | :--- |
| `User` | Account identity | Email normalized lowercase & unique |
| `UserSession` | Server-side sessions | SHA-256 session token hash, revocation state |
| `UserSettings` | User preferences | 1:1 with User; scan/retention/confirmation prefs |
| `Device` | Paired Windows computer | FK to User; status (CONNECTED, REVOKED, etc.) |
| `DevicePairingCode` | One-time pairing flow | Single-use, short-lived (15 min), SHA-256 hash |
| `AgentCredential` | Device bearer token | Stored only as SHA-256 hash; instant revocation |
| `Job` | Shared job identity | Base entity for SCAN and UPDATE jobs |
| `ScanJob` | Scan-specific details | 1:1 with Job; records scanned/found counts |
| `Application` | Installed software | Scoped to Device; matchStatus (MATCHED, UNMATCHED, UNKNOWN) |
| `ApplicationSnapshot`| Point-in-time snapshot | Links observed app version to scan job |
| `PackageIdentity` | Canonical package identity | Unique on `(packageId, source)` e.g. `Git.Git/winget` |
| `ReleaseMetadata` | Upstream package releases | Unique on `(packageIdentityId, version)` |
| `UpdateCandidate` | Available update | Linked to Application, PackageIdentity & Release |
| `UpdatePreview` | Execution capability | Single-use 15 min preview token hash |
| `UpdateJob` | Update execution details | Records exitCode, verifiedInstalledVersion, outcome |
| `IdempotencyRecord` | Request deduplication | Unique on `(userId, idempotencyKey)` |
| `SecurityFinding` | Verified CVE advisories | Linked only when package identity is verified |
| `AuditEvent` | Non-repudiation audit trail| Records actors, actions, and safe metadata |

---

## 4. Security Principles

1. **No Raw Secrets in Database or Logs**:
   - Passwords hashed with bcrypt (10 rounds).
   - Session tokens, agent bearer tokens, pairing codes, and preview tokens are stored exclusively as SHA-256 hashes.
   - Structured logger automatically redacts sensitive keys.
2. **Zero Browser Execution**:
   - The frontend never passes shell commands or executable arguments.
   - Updates are triggered only by referencing a validated `UpdateCandidate` via a single-use `previewToken`.
3. **Execution Idempotency**:
   - `POST /api/v1/updates/:id/execute` requires an `Idempotency-Key` header.
   - Replays with identical payload return the existing job; payload conflicts return `409 Conflict`.
4. **Spreadsheet Formula Injection Defense**:
   - CSV export sanitizes cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` by prepending a single quote.
5. **Multi-Tenant Isolation**:
   - Every device, application, job, scan, and candidate query is strictly scoped to `device.ownerUserId == req.user.id`.

---

## 5. Job Lifecycle State Machine

### Scan Lifecycle
`QUEUED` → `RUNNING` → `SUCCEEDED` | `FAILED` | `CANCELLED`

### Update Lifecycle
`previewed` → `awaiting_confirmation` → `QUEUED` → `RUNNING` → `VERIFYING` → `SUCCEEDED` | `FAILED` | `VERIFICATION_FAILED` | `CANCELLED`

- Execution success (`exitCode === 0`) and post-update verification success (`verificationResult === 'VERIFIED_SUCCESS'`) remain distinct. If an installer exits with code 0 but the application remains at the old version, the job terminates with `VERIFICATION_FAILED`.
