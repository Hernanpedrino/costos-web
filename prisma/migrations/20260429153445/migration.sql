/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Insumo` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `insumo` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX `Insumo_name_key` ON `Insumo`(`name`);
