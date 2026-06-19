-- CreateTable
CREATE TABLE `bej_np_cab` (
    `id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `codCliente` VARCHAR(6) NOT NULL,
    `razonSocial` VARCHAR(40) NOT NULL,

    INDEX `bej_np_cab_fecha_idx`(`fecha`),
    INDEX `bej_np_cab_codCliente_idx`(`codCliente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_np_det` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `npId` INTEGER NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(50) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,
    `importeTotal` DECIMAL(15, 2) NOT NULL,
    `precioUn` DECIMAL(15, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    INDEX `bej_np_det_artCodigo_idx`(`artCodigo`),
    INDEX `bej_np_det_npId_idx`(`npId`),
    INDEX `bej_np_det_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bej_np_det` ADD CONSTRAINT `bej_np_det_npId_fkey` FOREIGN KEY (`npId`) REFERENCES `bej_np_cab`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bej_np_det` ADD CONSTRAINT `bej_np_det_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `bej_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;
