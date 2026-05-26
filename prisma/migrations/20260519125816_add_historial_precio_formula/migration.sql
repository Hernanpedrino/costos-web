-- CreateTable
CREATE TABLE `HistorialPrecioFormula` (
    `id` VARCHAR(191) NOT NULL,
    `formulaId` VARCHAR(191) NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `insumoId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HistorialPrecioFormula_formulaId_idx`(`formulaId`),
    INDEX `HistorialPrecioFormula_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HistorialPrecioFormula` ADD CONSTRAINT `HistorialPrecioFormula_formulaId_fkey` FOREIGN KEY (`formulaId`) REFERENCES `Formula`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialPrecioFormula` ADD CONSTRAINT `HistorialPrecioFormula_insumoId_fkey` FOREIGN KEY (`insumoId`) REFERENCES `Insumo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
