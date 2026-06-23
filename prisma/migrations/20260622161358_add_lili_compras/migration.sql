-- CreateTable
CREATE TABLE `lili_compras_cab` (
    `id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `codProveedor` VARCHAR(6) NOT NULL,
    `razonSocial` VARCHAR(40) NOT NULL,
    `importeTotal` DECIMAL(15, 2) NOT NULL,

    INDEX `lili_compras_cab_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lili_compras_det` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `compraId` INTEGER NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,
    `neto` DECIMAL(15, 2) NOT NULL,
    `precioUnit` DECIMAL(15, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    INDEX `lili_compras_det_artCodigo_idx`(`artCodigo`),
    INDEX `lili_compras_det_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lili_compras_det` ADD CONSTRAINT `lili_compras_det_compraId_fkey` FOREIGN KEY (`compraId`) REFERENCES `lili_compras_cab`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lili_compras_det` ADD CONSTRAINT `lili_compras_det_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `lili_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;
