-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('UNPAIRED', 'PAIRING', 'CONNECTED', 'DISCONNECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('SCAN', 'UPDATE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'VERIFYING', 'VERIFICATION_FAILED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'UNKNOWN', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('PENDING', 'VERIFIED_SUCCESS', 'VERIFICATION_FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "scan_preferences" JSONB NOT NULL DEFAULT '{"scanMode": "full", "scheduleIntervalDays": 7}',
    "require_update_confirmation" BOOLEAN NOT NULL DEFAULT true,
    "notification_preferences" JSONB NOT NULL DEFAULT '{"notifyOnUpdates": true, "notifyOnFailures": true}',
    "data_retention_days" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "os_info" TEXT,
    "agent_version" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'CONNECTED',
    "last_seen_at" TIMESTAMP(3),
    "paired_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_pairing_codes" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "paired_device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_credentials" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "lease_expires_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_jobs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "scan_mode" TEXT NOT NULL DEFAULT 'full',
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "found_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "package_identity_id" TEXT,
    "display_name" TEXT NOT NULL,
    "publisher" TEXT,
    "installed_version" TEXT NOT NULL,
    "source" TEXT DEFAULT 'unknown',
    "match_status" "MatchStatus" NOT NULL DEFAULT 'UNKNOWN',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_snapshots" (
    "id" TEXT NOT NULL,
    "scan_job_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "publisher" TEXT,
    "installed_version" TEXT NOT NULL,
    "match_status" "MatchStatus" NOT NULL,
    "source" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_identities" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'winget',
    "publisher" TEXT,
    "architecture" TEXT DEFAULT 'x64',
    "match_confidence" DOUBLE PRECISION DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_metadata" (
    "id" TEXT NOT NULL,
    "package_identity_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT,
    "release_date" TIMESTAMP(3),
    "changelog_url" TEXT,
    "release_notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'winget',
    "may_require_admin" BOOLEAN NOT NULL DEFAULT true,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_candidates" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "package_identity_id" TEXT NOT NULL,
    "release_metadata_id" TEXT,
    "current_version" TEXT NOT NULL,
    "target_version" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'winget',
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "update_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_previews" (
    "id" TEXT NOT NULL,
    "update_candidate_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "preview_token_hash" TEXT NOT NULL,
    "target_version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "may_require_admin" BOOLEAN NOT NULL DEFAULT true,
    "release_notes_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "update_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_jobs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "update_candidate_id" TEXT,
    "preview_id" TEXT,
    "target_version" TEXT NOT NULL,
    "exit_code" INTEGER,
    "restart_required" BOOLEAN NOT NULL DEFAULT false,
    "verified_installed_version" TEXT,
    "verification_result" "VerificationResult" NOT NULL DEFAULT 'PENDING',
    "safe_diagnostics" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "update_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_job_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_findings" (
    "id" TEXT NOT NULL,
    "package_identity_id" TEXT NOT NULL,
    "advisory_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "affected_version_range" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "device_id" TEXT,
    "job_id" TEXT,
    "event_type" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "safe_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_id_hash_key" ON "user_sessions"("session_id_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_session_id_hash_idx" ON "user_sessions"("session_id_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "devices_owner_user_id_idx" ON "devices"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_pairing_codes_code_hash_key" ON "device_pairing_codes"("code_hash");

-- CreateIndex
CREATE INDEX "device_pairing_codes_owner_user_id_idx" ON "device_pairing_codes"("owner_user_id");

-- CreateIndex
CREATE INDEX "device_pairing_codes_code_hash_idx" ON "device_pairing_codes"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "agent_credentials_credential_hash_key" ON "agent_credentials"("credential_hash");

-- CreateIndex
CREATE INDEX "agent_credentials_device_id_idx" ON "agent_credentials"("device_id");

-- CreateIndex
CREATE INDEX "agent_credentials_credential_hash_idx" ON "agent_credentials"("credential_hash");

-- CreateIndex
CREATE INDEX "jobs_device_id_idx" ON "jobs"("device_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_kind_idx" ON "jobs"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "scan_jobs_job_id_key" ON "scan_jobs"("job_id");

-- CreateIndex
CREATE INDEX "applications_device_id_idx" ON "applications"("device_id");

-- CreateIndex
CREATE INDEX "applications_package_identity_id_idx" ON "applications"("package_identity_id");

-- CreateIndex
CREATE INDEX "applications_match_status_idx" ON "applications"("match_status");

-- CreateIndex
CREATE INDEX "application_snapshots_scan_job_id_idx" ON "application_snapshots"("scan_job_id");

-- CreateIndex
CREATE INDEX "application_snapshots_application_id_idx" ON "application_snapshots"("application_id");

-- CreateIndex
CREATE INDEX "package_identities_package_id_idx" ON "package_identities"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_identities_package_id_source_key" ON "package_identities"("package_id", "source");

-- CreateIndex
CREATE INDEX "release_metadata_package_identity_id_idx" ON "release_metadata"("package_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_metadata_package_identity_id_version_key" ON "release_metadata"("package_identity_id", "version");

-- CreateIndex
CREATE INDEX "update_candidates_application_id_idx" ON "update_candidates"("application_id");

-- CreateIndex
CREATE INDEX "update_candidates_package_identity_id_idx" ON "update_candidates"("package_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "update_previews_preview_token_hash_key" ON "update_previews"("preview_token_hash");

-- CreateIndex
CREATE INDEX "update_previews_preview_token_hash_idx" ON "update_previews"("preview_token_hash");

-- CreateIndex
CREATE INDEX "update_previews_update_candidate_id_idx" ON "update_previews"("update_candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "update_jobs_job_id_key" ON "update_jobs"("job_id");

-- CreateIndex
CREATE INDEX "idempotency_records_user_id_idempotency_key_idx" ON "idempotency_records"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_idempotency_key_key" ON "idempotency_records"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "security_findings_package_identity_id_idx" ON "security_findings"("package_identity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_events_device_id_idx" ON "audit_events"("device_id");

-- CreateIndex
CREATE INDEX "audit_events_event_type_idx" ON "audit_events"("event_type");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pairing_codes" ADD CONSTRAINT "device_pairing_codes_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pairing_codes" ADD CONSTRAINT "device_pairing_codes_paired_device_id_fkey" FOREIGN KEY ("paired_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_package_identity_id_fkey" FOREIGN KEY ("package_identity_id") REFERENCES "package_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_snapshots" ADD CONSTRAINT "application_snapshots_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_snapshots" ADD CONSTRAINT "application_snapshots_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_metadata" ADD CONSTRAINT "release_metadata_package_identity_id_fkey" FOREIGN KEY ("package_identity_id") REFERENCES "package_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_candidates" ADD CONSTRAINT "update_candidates_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_candidates" ADD CONSTRAINT "update_candidates_package_identity_id_fkey" FOREIGN KEY ("package_identity_id") REFERENCES "package_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_candidates" ADD CONSTRAINT "update_candidates_release_metadata_id_fkey" FOREIGN KEY ("release_metadata_id") REFERENCES "release_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_previews" ADD CONSTRAINT "update_previews_update_candidate_id_fkey" FOREIGN KEY ("update_candidate_id") REFERENCES "update_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_previews" ADD CONSTRAINT "update_previews_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_previews" ADD CONSTRAINT "update_previews_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_jobs" ADD CONSTRAINT "update_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_jobs" ADD CONSTRAINT "update_jobs_update_candidate_id_fkey" FOREIGN KEY ("update_candidate_id") REFERENCES "update_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_jobs" ADD CONSTRAINT "update_jobs_preview_id_fkey" FOREIGN KEY ("preview_id") REFERENCES "update_previews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_package_identity_id_fkey" FOREIGN KEY ("package_identity_id") REFERENCES "package_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

