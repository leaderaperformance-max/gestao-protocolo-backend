/*
  Warnings:

  - You are about to drop the column `createdBy` on the `request_types` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `protocol_sequences` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserId` to the `request_types` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "protocol_sequences" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "request_types" DROP COLUMN "createdBy",
ADD COLUMN     "createdByUserId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "attachments_requestId_idx" ON "attachments"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "request_status_history_requestId_idx" ON "request_status_history"("requestId");

-- CreateIndex
CREATE INDEX "request_tramitations_requestId_idx" ON "request_tramitations"("requestId");

-- CreateIndex
CREATE INDEX "requests_status_idx" ON "requests"("status");

-- CreateIndex
CREATE INDEX "requests_currentSectorId_idx" ON "requests"("currentSectorId");

-- CreateIndex
CREATE INDEX "requests_requesterId_idx" ON "requests"("requesterId");

-- CreateIndex
CREATE INDEX "requests_createdAt_idx" ON "requests"("createdAt");

-- CreateIndex
CREATE INDEX "requests_deadlineAt_idx" ON "requests"("deadlineAt");

-- CreateIndex
CREATE INDEX "users_sectorId_idx" ON "users"("sectorId");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- AddForeignKey
ALTER TABLE "request_types" ADD CONSTRAINT "request_types_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
