-- CreateTable
CREATE TABLE `lili_articulos` (
    `codigo` VARCHAR(191) NOT NULL,
    `descripcion` VARCHAR(50) NOT NULL,
    `clasificacion` VARCHAR(1) NULL,
    `esProducido` BOOLEAN NOT NULL DEFAULT false,
    `esVendido` BOOLEAN NOT NULL DEFAULT false,
    `esComprado` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`codigo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lili_ventas_cab` (
    `id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `codCliente` VARCHAR(6) NOT NULL,
    `razonSocial` VARCHAR(40) NOT NULL,
    `importeTotal` DECIMAL(15, 2) NOT NULL,
    `tipoComp` VARCHAR(5) NOT NULL,

    INDEX `lili_ventas_cab_fecha_idx`(`fecha`),
    INDEX `lili_ventas_cab_codCliente_idx`(`codCliente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lili_ventas_det` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ventaId` INTEGER NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(50) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,
    `neto` DECIMAL(15, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    INDEX `lili_ventas_det_artCodigo_idx`(`artCodigo`),
    INDEX `lili_ventas_det_ventaId_idx`(`ventaId`),
    INDEX `lili_ventas_det_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lili_lista_precios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listaCod` VARCHAR(3) NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `precio` DECIMAL(15, 2) NOT NULL,
    `fechaMod` DATETIME(3) NOT NULL,

    INDEX `lili_lista_precios_artCodigo_idx`(`artCodigo`),
    UNIQUE INDEX `lili_lista_precios_listaCod_artCodigo_key`(`listaCod`, `artCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lili_ventas_det` ADD CONSTRAINT `lili_ventas_det_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `lili_ventas_cab`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lili_ventas_det` ADD CONSTRAINT `lili_ventas_det_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `lili_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lili_lista_precios` ADD CONSTRAINT `lili_lista_precios_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `lili_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;
