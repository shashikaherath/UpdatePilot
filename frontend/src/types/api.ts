export interface ApiErrorDetails {
  issues?: Array<{ path: string; message: string }>;
  [key: string]: unknown;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: ApiErrorDetails;
  };
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export type DeviceStatus = 'UNPAIRED' | 'PAIRING' | 'CONNECTED' | 'DISCONNECTED' | 'REVOKED';

export interface Device {
  id: string;
  deviceName: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
  agentVersion: string | null;
  osInfo: string | null;
  pairedAt?: string | null;
  createdAt?: string;
  _count?: {
    applications?: number;
    jobs?: number;
  };
}

export interface PairingCodeResponse {
  pairingCode: string;
  expiresAt: string;
  deviceName: string;
}

export interface ScanJobResponse {
  scanId: string;
  jobId: string;
  state: string;
  createdAt: string;
}

export type MatchStatus = 'MATCHED' | 'UNMATCHED' | 'UNKNOWN' | 'UNSUPPORTED';

export interface Application {
  id: string;
  deviceId: string;
  displayName: string;
  publisher: string | null;
  installedVersion: string;
  source: string | null;
  matchStatus: MatchStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  deviceName?: string;
  packageId?: string | null;
  availableVersion?: string | null;
  updateCandidateId?: string | null;
  device?: {
    deviceName: string;
  };
  packageIdentity?: {
    packageId: string;
    source: string;
    publisher: string | null;
    architecture: string | null;
  } | null;
}

export interface ApplicationDetail extends Application {
  releases?: Array<{
    version: string;
    releaseDate: string | null;
    changelogUrl: string | null;
  }>;
  updateCandidates?: Array<{
    id: string;
    targetVersion: string;
    source: string;
    checkedAt: string;
  }>;
}

export interface UpdateCandidateItem {
  id: string;
  applicationId: string;
  applicationName?: string;
  deviceId?: string;
  deviceName?: string;
  packageId?: string;
  publisher?: string | null;
  installedVersion?: string;
  targetVersion: string;
  source: string;
  checkedAt: string;
  changelogUrl?: string | null;
  mayRequireAdmin?: boolean;
  application: {
    id: string;
    displayName: string;
    publisher: string | null;
    installedVersion: string;
    device: {
      id: string;
      deviceName: string;
    };
  };
  releaseMetadata?: {
    version: string;
    releaseDate: string | null;
    changelogUrl: string | null;
    releaseNotes: string | null;
    mayRequireAdmin: boolean;
  } | null;
}

export interface UpdatePreviewResponse {
  applicationId: string;
  packageId: string;
  source: string;
  installedVersion: string;
  targetVersion: string;
  releaseNotesUrl: string | null;
  mayRequireAdmin: boolean;
  previewToken: string;
  expiresAt: string;
}

export interface ExecuteUpdateResponse {
  jobId: string;
  state: string;
}

export type JobKind = 'SCAN' | 'UPDATE';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'VERIFYING' | 'VERIFICATION_FAILED';

export interface JobDetail {
  id: string;
  deviceId: string;
  kind: JobKind;
  status: JobStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorSummary: string | null;
  createdAt: string;
  device: {
    deviceName: string;
  };
  scanJob?: {
    scanMode: string;
    scannedCount: number;
    foundCount: number;
  } | null;
  updateJob?: {
    targetVersion: string;
    exitCode: number | null;
    restartRequired: boolean;
    verifiedInstalledVersion: string | null;
    verificationResult: string;
    safeDiagnostics: string | null;
  } | null;
}

export interface AuditEventItem {
  id: string;
  actorType: string;
  actorUserId: string | null;
  deviceId: string | null;
  jobId: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  safeMetadata: Record<string, unknown> | null;
  createdAt: string;
  device?: {
    deviceName: string;
  } | null;
}

export interface UserSettings {
  id: string;
  userId: string;
  theme: 'light' | 'dark' | 'system';
  scanPreferences: {
    scanMode: 'full' | 'quick';
    scheduleIntervalDays: number;
  };
  requireUpdateConfirmation: boolean;
  notificationPreferences: {
    notifyOnUpdates: boolean;
    notifyOnFailures: boolean;
  };
  dataRetentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface LastScan {
  jobId: string;
  status: string;
  deviceName: string;
  scanMode: string;
  scannedCount: number;
  foundCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface RecentActivity {
  id: string;
  actorType: string;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  safeMetadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardData {
  applicationCount: number;
  availableUpdatesCount: number;
  lastScan: LastScan | null;
  devices: Device[];
  recentActivity: RecentActivity[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface AuthResponse {
  user: User;
  message: string;
}

export interface HealthResponse {
  status: string;
  environment: string;
  timestamp: string;
  uptime: number;
}
