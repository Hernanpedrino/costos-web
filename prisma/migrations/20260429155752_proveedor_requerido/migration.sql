/*
  Warnings:

  - Made the column `suplier` on table `insumo` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `insumo` MODIFY `suplier` VARCHAR(191) NOT NULL;
