/*
  Warnings:

  - You are about to drop the `inputs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `inputs`;

-- CreateTable
CREATE TABLE `Insumo` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `suplier` VARCHAR(191) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Formula` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Formula_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormulaDetalle` (
    `id` VARCHAR(191) NOT NULL,
    `cantidad` VARCHAR(191) NOT NULL,
    `formulaId` VARCHAR(191) NOT NULL,
    `insumoId` VARCHAR(191) NULL,
    `subFormulaId` VARCHAR(191) NULL,

    INDEX `FormulaDetalle_formulaId_idx`(`formulaId`),
    INDEX `FormulaDetalle_insumoId_idx`(`insumoId`),
    INDEX `FormulaDetalle_subFormulaId_idx`(`subFormulaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FormulaDetalle` ADD CONSTRAINT `FormulaDetalle_formulaId_fkey` FOREIGN KEY (`formulaId`) REFERENCES `Formula`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormulaDetalle` ADD CONSTRAINT `FormulaDetalle_insumoId_fkey` FOREIGN KEY (`insumoId`) REFERENCES `Insumo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormulaDetalle` ADD CONSTRAINT `FormulaDetalle_subFormulaId_fkey` FOREIGN KEY (`subFormulaId`) REFERENCES `Formula`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
