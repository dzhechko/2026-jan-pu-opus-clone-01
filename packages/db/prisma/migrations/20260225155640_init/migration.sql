-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('email', 'vk');

-- CreateEnum
CREATE TYPE "LLMProviderPreference" AS ENUM ('ru', 'global');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('uploading', 'downloading', 'transcribing', 'analyzing', 'generating_clips', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "VideoSourceType" AS ENUM ('upload', 'url');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('pending', 'rendering', 'ready', 'published', 'failed');

-- CreateEnum
CREATE TYPE "ClipFormat" AS ENUM ('portrait', 'square', 'landscape');

-- CreateEnum
CREATE TYPE "PublicationPlatform" AS ENUM ('vk', 'rutube', 'dzen', 'telegram');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('scheduled', 'publishing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due', 'expired');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'sbp');

-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('free', 'start', 'pro', 'business');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "password_hash" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'email',
    "vk_id" TEXT,
    "plan_id" "PlanId" NOT NULL DEFAULT 'free',
    "minutes_used" INTEGER NOT NULL DEFAULT 0,
    "minutes_limit" INTEGER NOT NULL DEFAULT 30,
    "billing_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llm_provider_preference" "LLMProviderPreference" NOT NULL DEFAULT 'ru',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" "VideoSourceType" NOT NULL,
    "source_url" TEXT,
    "file_path" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "status" "VideoStatus" NOT NULL DEFAULT 'uploading',
    "llm_provider_used" "LLMProviderPreference",
    "processing_cost_kopecks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "segments" JSONB NOT NULL DEFAULT '[]',
    "full_text" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "stt_model" TEXT NOT NULL,
    "stt_provider" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clips" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "virality_score" JSONB NOT NULL,
    "format" "ClipFormat" NOT NULL DEFAULT 'portrait',
    "subtitle_segments" JSONB NOT NULL DEFAULT '[]',
    "cta" JSONB,
    "file_path" TEXT,
    "thumbnail_path" TEXT,
    "status" "ClipStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "clip_id" UUID NOT NULL,
    "platform" "PublicationPlatform" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "platform_post_id" TEXT,
    "platform_url" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "last_stats_sync" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" "PlanId" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "payment_provider" TEXT NOT NULL DEFAULT 'yookassa',
    "payment_method" "PaymentMethod" NOT NULL,
    "external_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "minutes_consumed" DOUBLE PRECISION NOT NULL,
    "llm_cost_kopecks" INTEGER NOT NULL DEFAULT 0,
    "stt_cost_kopecks" INTEGER NOT NULL DEFAULT 0,
    "gpu_cost_kopecks" INTEGER NOT NULL DEFAULT 0,
    "provider_strategy" "LLMProviderPreference" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "PublicationPlatform" NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_vk_id_key" ON "users"("vk_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "videos_user_id_created_at_idx" ON "videos"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_video_id_key" ON "transcripts"("video_id");

-- CreateIndex
CREATE INDEX "clips_video_id_idx" ON "clips"("video_id");

-- CreateIndex
CREATE INDEX "clips_user_id_created_at_idx" ON "clips"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "publications_clip_id_idx" ON "publications"("clip_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "usage_records_user_id_created_at_idx" ON "usage_records"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "platform_connections_user_id_platform_key" ON "platform_connections"("user_id", "platform");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
