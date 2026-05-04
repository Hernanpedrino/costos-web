/*
  Warnings:

  - You are about to alter the column `cantidad` on the `formuladetalle` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Decimal(10,4)`.

*/
-- AlterTable
ALTER TABLE `formuladetalle` MODIFY `cantidad` DECIMAL(10, 4) NOT NULL;
