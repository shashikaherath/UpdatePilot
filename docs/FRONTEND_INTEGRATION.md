# UpdatePilot — Frontend Integration Guide

This guide describes how to connect the Next.js / Vite web dashboard to the UpdatePilot Backend API.

---

## 1. Base URL & Endpoints

- **Backend Base URL**: `http://localhost:3001`
- **Dashboard API Prefix**: `/api/v1`
- **Swagger Documentation**: `http://localhost:3001/api/docs`
- **OpenAPI JSON**: `http://localhost:3001/api/docs-json`

---

## 2. Authentication Flow

The Dashboard API uses **HTTP-only, SameSite=Lax** cookies backed by PostgreSQL sessions.

### Axios / Fetch Setup
Ensure `credentials: 'include'` (Fetch) or `withCredentials: true` (Axios) is configured for all requests:

```typescript
import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Endpoints
1. `POST /api/v1/auth/register`: `{ email, password }` -> `201 Created`
2. `POST /api/v1/auth/login`: `{ email, password }` -> `200 OK`
3. `POST /api/v1/auth/logout`: -> `204 No Content`

---

## 3. Dashboard & Device Management

### Overview Statistics
- `GET /api/v1/dashboard`:
  ```json
  {
    "data": {
      "applicationCount": 5,
      "availableUpdatesCount": 2,
      "lastScan": {
        "jobId": "...",
        "status": "SUCCEEDED",
        "deviceName": "DESKTOP-PILOT-01",
        "scannedCount": 5,
        "completedAt": "2026-10-29T08:00:00.000Z"
      },
      "devices": [...],
      "recentActivity": [...]
    }
  }
  ```

### Generate Pairing Code
- `POST /api/v1/devices/pairing-codes`:
  ```json
  // Request
  { "deviceName": "My Windows PC" }

  // Response (201 Created)
  {
    "pairingCode": "UP-A4F1-92CD",
    "expiresAt": "2026-10-29T08:15:00.000Z",
    "deviceName": "My Windows PC"
  }
  ```

---

## 4. Software Inventory & Updates

### Applications Inventory
- `GET /api/v1/applications?q=git&status=MATCHED&page=1&pageSize=25`
  ```json
  {
    "data": [
      {
        "id": "...",
        "displayName": "Git",
        "publisher": "The Git Project",
        "installedVersion": "2.44.0",
        "availableVersion": "2.47.1",
        "matchStatus": "MATCHED",
        "source": "winget"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 25,
      "total": 1,
      "totalPages": 1
    }
  }
  ```

### Start Scan
- `POST /api/v1/devices/:id/scans` -> `202 Accepted`
  ```json
  {
    "scanId": "...",
    "jobId": "...",
    "state": "queued",
    "createdAt": "..."
  }
  ```

### Safe 2-Step Update Workflow

1. **Step 1: Request Preview**
   - `POST /api/v1/updates/:candidateId/preview` -> `200 OK`
   ```json
   {
     "applicationId": "...",
     "packageId": "Git.Git",
     "source": "winget",
     "installedVersion": "2.44.0",
     "targetVersion": "2.47.1",
     "releaseNotesUrl": "https://...",
     "mayRequireAdmin": true,
     "previewToken": "94f0a3...",
     "expiresAt": "..."
   }
   ```

2. **Step 2: Confirm & Execute**
   - `POST /api/v1/updates/:candidateId/execute` -> `202 Accepted`
   - Headers: `Idempotency-Key: <unique-uuid>`
   - Body: `{ "previewToken": "94f0a3..." }`
   ```json
   {
     "jobId": "...",
     "state": "queued"
   }
   ```

3. **Step 3: Poll Status**
   - `GET /api/v1/jobs/:jobId` -> Polled until status is `succeeded`, `failed`, or `verification_failed`.
