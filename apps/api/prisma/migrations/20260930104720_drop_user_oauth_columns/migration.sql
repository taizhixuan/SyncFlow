/*
  Warnings:

  - You are about to drop the column `oauth_provider` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `oauth_subject` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_oauth_provider_oauth_subject_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "oauth_provider",
DROP COLUMN "oauth_subject";
