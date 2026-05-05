-- DropIndex
DROP INDEX `RegistroAccion_entidad_idx` ON `registroaccion`;

-- CreateTable
CREATE TABLE `HistorialPrecioInsumo` (
    `id` VARCHAR(191) NOT NULL,
    `insumoId` VARCHAR(191) NOT NULL,
    `precioAntes` DECIMAL(10, 2) NOT NULL,
    `precioDespues` DECIMAL(10, 2) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HistorialPrecioInsumo_insumoId_idx`(`insumoId`),
    INDEX `HistorialPrecioInsumo_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HistorialPrecioInsumo` ADD CONSTRAINT `HistorialPrecioInsumo_insumoId_fkey` FOREIGN KEY (`insumoId`) REFERENCES `Insumo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialPrecioInsumo` ADD CONSTRAINT `HistorialPrecioInsumo_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
