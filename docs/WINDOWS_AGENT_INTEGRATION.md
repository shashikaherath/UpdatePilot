# UpdatePilot — Windows Agent Integration Guide

This guide describes how a Windows Agent (written in PowerShell, C#/.NET, or Node.js) interacts with the UpdatePilot backend.

---

## 1. Authentication & Pairing Ceremony

The agent authenticates via `Authorization: Bearer <device-token>`.

### Step 1: User Generates Code in Dashboard
The signed-in user requests a pairing code (e.g. `UP-A1B2-C3D4`) in the web UI.

### Step 2: Agent Exchanges Code for Bearer Token
The agent calls:
```http
POST /agent/v1/pair
Content-Type: application/json

{
  "pairingCode": "UP-A1B2-C3D4",
  "osInfo": "Windows 11 Pro 23H2 (Build 22631)",
  "agentVersion": "1.0.0"
}
```

Response (`201 Created`):
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceName": "DESKTOP-PILOT-01",
  "deviceToken": "94f0e21a8b3c..."
}
```
> [!IMPORTANT]
> The `deviceToken` is returned **only once**. The agent must save it securely in local encrypted storage (e.g. Windows DPAPI or Credential Manager).

---

## 2. Heartbeat Loop

The agent should send a heartbeat every 30 seconds to report liveness:
```http
POST /agent/v1/heartbeat
Authorization: Bearer <deviceToken>
Content-Type: application/json

{
  "agentVersion": "1.0.0",
  "osInfo": "Windows 11 Pro 23H2"
}
```

---

## 3. Background Job Execution Lifecycle

The agent regularly polls for queued jobs:
```http
POST /agent/v1/jobs/claim
Authorization: Bearer <deviceToken>
```
- If no job: HTTP `204 No Content`
- If job assigned: HTTP `200 OK`

### Case A: SCAN Job
Payload:
```json
{
  "jobId": "...",
  "kind": "SCAN",
  "scanMode": "full"
}
```

**Agent Actions**:
1. Run local software discovery (e.g. via `winget list` or registry query).
2. Submit results:
```http
POST /agent/v1/scans/{jobId}/results
Authorization: Bearer <deviceToken>
Content-Type: application/json

{
  "applications": [
    {
      "displayName": "Google Chrome",
      "publisher": "Google LLC",
      "installedVersion": "130.0.6723.117",
      "source": "winget",
      "packageId": "Google.Chrome"
    },
    {
      "displayName": "Custom Legacy Tool",
      "publisher": "Unknown",
      "installedVersion": "1.0",
      "source": "registry",
      "packageId": null
    }
  ]
}
```

### Case B: UPDATE Job
Payload:
```json
{
  "jobId": "...",
  "kind": "UPDATE",
  "packageId": "Git.Git",
  "targetVersion": "2.47.1",
  "source": "winget",
  "mayRequireAdmin": true
}
```

**Agent Actions**:
1. Run allowlisted update command: `winget upgrade --id Git.Git --version 2.47.1 --exact --accept-package-agreements --accept-source-agreements`
2. Renew lease via `POST /agent/v1/jobs/{jobId}/heartbeat` if install takes > 2 minutes.
3. Rescan installed version to verify update succeeded:
4. Report outcome:
```http
POST /agent/v1/jobs/{jobId}/result
Authorization: Bearer <deviceToken>
Content-Type: application/json

{
  "exitCode": 0,
  "restartRequired": false,
  "rescannedVersion": "2.47.1",
  "verificationResult": "VERIFIED_SUCCESS",
  "safeDiagnostics": "WinGet completed with exit code 0."
}
```
