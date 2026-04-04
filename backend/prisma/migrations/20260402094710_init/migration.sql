-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('pilot', 'starter', 'growth', 'enterprise');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('hireiq_admin', 'agency_admin', 'senior_recruiter', 'recruiter', 'viewer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'active', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('onsite', 'hybrid', 'remote');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('AED', 'SAR', 'USD');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('applied', 'screening', 'cv_received', 'evaluated', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn', 'held');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('initiated', 'language_selection', 'consent_pending', 'screening_q1', 'screening_q2', 'screening_q3', 'screening_q4', 'screening_q5', 'screening_q6', 'cv_requested', 'cv_received', 'profile_collection', 'processing', 'shortlisted', 'slots_requested', 'scheduled', 'completed', 'timeout');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "AuthenticityFlag" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('awaiting_slots', 'confirmed', 'reminder_sent', 'completed', 'no_show', 'cancelled');

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "logo_url" TEXT,
    "wa_number" VARCHAR(20),
    "wa_api_key" TEXT,
    "wa_webhook_secret" TEXT,
    "email_from_name" VARCHAR(200),
    "email_from_address" VARCHAR(300),
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'pilot',
    "subscription_start" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "agency_id" UUID NOT NULL,
    "azure_oid" VARCHAR(100),
    "email" VARCHAR(300) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "role" "UserRole" NOT NULL,
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "invite_token" VARCHAR(100),
    "invite_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "agency_id" UUID NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "hiring_company" VARCHAR(300) NOT NULL,
    "location_country" VARCHAR(10) NOT NULL,
    "location_city" VARCHAR(100) NOT NULL,
    "job_type" "JobType" NOT NULL,
    "salary_min" INTEGER NOT NULL,
    "salary_max" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'AED',
    "required_skills" TEXT[],
    "preferred_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_experience_years" INTEGER NOT NULL DEFAULT 0,
    "required_languages" TEXT[],
    "jd_text" TEXT NOT NULL,
    "extracted_criteria" JSONB,
    "screening_questions" JSONB,
    "apply_url_slug" VARCHAR(100) NOT NULL,
    "wa_shortcode" VARCHAR(20) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "closing_date" TIMESTAMP(3),
    "shortlist_threshold" INTEGER NOT NULL DEFAULT 20,
    "activated_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "agency_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "wa_number_hash" VARCHAR(64) NOT NULL,
    "wa_number_encrypted" TEXT NOT NULL,
    "preferred_language" VARCHAR(10),
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "consent_timestamp" TIMESTAMP(3),
    "consent_message_id" VARCHAR(100),
    "full_name" VARCHAR(300),
    "email" VARCHAR(300),
    "current_role" VARCHAR(300),
    "years_experience" SMALLINT,
    "salary_expectation" INTEGER,
    "notice_period_days" SMALLINT,
    "visa_status" VARCHAR(50),
    "cv_file_url" TEXT,
    "cv_structured" JSONB,
    "cv_type" VARCHAR(20),
    "authenticity_flag" "AuthenticityFlag" NOT NULL DEFAULT 'none',
    "commitment_score" SMALLINT,
    "cv_match_score" SMALLINT,
    "salary_fit_score" SMALLINT,
    "composite_score" SMALLINT,
    "hard_filter_pass" BOOLEAN,
    "hard_filter_fail_reason" VARCHAR(200),
    "ai_summary" TEXT,
    "data_tags" JSONB NOT NULL DEFAULT '{}',
    "pipeline_stage" "PipelineStage" NOT NULL DEFAULT 'applied',
    "rejection_reason" VARCHAR(100),
    "recruiter_note" TEXT,
    "conversation_state" "ConversationState" NOT NULL DEFAULT 'initiated',
    "conversation_state_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shortlisted_at" TIMESTAMP(3),
    "hired_at" TIMESTAMP(3),
    "deletion_scheduled_at" TIMESTAMP(3),
    "source_channel" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "candidate_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "message_type" VARCHAR(30) NOT NULL,
    "content" TEXT NOT NULL,
    "wa_message_id" VARCHAR(100),
    "delivery_status" VARCHAR(20),
    "question_index" SMALLINT,
    "answer_score" SMALLINT,
    "answer_quality" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "candidate_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "candidate_slots_offered" JSONB,
    "status" "InterviewStatus" NOT NULL DEFAULT 'awaiting_slots',
    "reminder_48h_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_24h_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_4h_sent" BOOLEAN NOT NULL DEFAULT false,
    "outcome" VARCHAR(30),
    "interview_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "agency_id" UUID,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_wa_number_key" ON "agencies"("wa_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_agency_id_email_key" ON "users"("agency_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_apply_url_slug_key" ON "jobs"("apply_url_slug");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_wa_shortcode_key" ON "jobs"("wa_shortcode");

-- CreateIndex
CREATE INDEX "jobs_agency_id_status_idx" ON "jobs"("agency_id", "status");

-- CreateIndex
CREATE INDEX "jobs_recruiter_id_idx" ON "jobs"("recruiter_id");

-- CreateIndex
CREATE INDEX "candidates_agency_id_job_id_pipeline_stage_idx" ON "candidates"("agency_id", "job_id", "pipeline_stage");

-- CreateIndex
CREATE INDEX "candidates_agency_id_composite_score_idx" ON "candidates"("agency_id", "composite_score" DESC);

-- CreateIndex
CREATE INDEX "candidates_deletion_scheduled_at_idx" ON "candidates"("deletion_scheduled_at");

-- CreateIndex
CREATE INDEX "screening_messages_candidate_id_created_at_idx" ON "screening_messages"("candidate_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_candidate_id_key" ON "interviews"("candidate_id");

-- CreateIndex
CREATE INDEX "interviews_agency_id_scheduled_at_idx" ON "interviews"("agency_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "audit_log_agency_id_entity_type_created_at_idx" ON "audit_log"("agency_id", "entity_type", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_messages" ADD CONSTRAINT "screening_messages_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
