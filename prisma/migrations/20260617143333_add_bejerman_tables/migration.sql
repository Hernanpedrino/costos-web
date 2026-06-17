-- CreateTable
CREATE TABLE `bej_articulos` (
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
CREATE TABLE `bej_ventas_cab` (
    `id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `codCliente` VARCHAR(6) NOT NULL,
    `razonSocial` VARCHAR(40) NOT NULL,
    `importeTotal` DECIMAL(15, 2) NOT NULL,
    `anulado` BOOLEAN NOT NULL DEFAULT false,

    INDEX `bej_ventas_cab_fecha_idx`(`fecha`),
    INDEX `bej_ventas_cab_codCliente_idx`(`codCliente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_ventas_det` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ventaId` INTEGER NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(50) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,
    `neto` DECIMAL(15, 2) NOT NULL,
    `precioCosto` DECIMAL(15, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    INDEX `bej_ventas_det_artCodigo_idx`(`artCodigo`),
    INDEX `bej_ventas_det_ventaId_idx`(`ventaId`),
    INDEX `bej_ventas_det_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_compras_cab` (
    `id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `codProveedor` VARCHAR(6) NOT NULL,
    `razonSocial` VARCHAR(40) NOT NULL,
    `importeTotal` DECIMAL(15, 2) NOT NULL,
    `anulado` BOOLEAN NOT NULL DEFAULT false,

    INDEX `bej_compras_cab_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_compras_det` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `compraId` INTEGER NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,
    `neto` DECIMAL(15, 2) NOT NULL,
    `precioUnit` DECIMAL(15, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    INDEX `bej_compras_det_artCodigo_idx`(`artCodigo`),
    INDEX `bej_compras_det_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_lista_precios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listaCod` VARCHAR(3) NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `precio` DECIMAL(15, 2) NOT NULL,
    `fechaMod` DATETIME(3) NOT NULL,

    INDEX `bej_lista_precios_artCodigo_idx`(`artCodigo`),
    UNIQUE INDEX `bej_lista_precios_listaCod_artCodigo_key`(`listaCod`, `artCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_prod_formulas` (
    `formula` VARCHAR(32) NOT NULL,
    `batch` DECIMAL(15, 4) NOT NULL,
    `costoTotal` DECIMAL(15, 2) NOT NULL,
    `costoComp` DECIMAL(15, 2) NOT NULL,
    `costoRrhh` DECIMAL(15, 2) NOT NULL,
    `costoMaq` DECIMAL(15, 2) NOT NULL,
    `costoInd` DECIMAL(15, 2) NOT NULL,
    `fechaCosto` DATETIME(3) NULL,
    `vigente` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`formula`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_prod_formula_comp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `formula` VARCHAR(32) NOT NULL,
    `componente` VARCHAR(41) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,

    INDEX `bej_prod_formula_comp_formula_idx`(`formula`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bej_etl_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tabla` VARCHAR(50) NOT NULL,
    `registros` INTEGER NOT NULL,
    `durMs` INTEGER NOT NULL,
    `estado` VARCHAR(10) NOT NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bej_ventas_det` ADD CONSTRAINT `bej_ventas_det_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `bej_ventas_cab`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bej_ventas_det` ADD CONSTRAINT `bej_ventas_det_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `bej_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bej_compras_det` ADD CONSTRAINT `bej_compras_det_compraId_fkey` FOREIGN KEY (`compraId`) REFERENCES `bej_compras_cab`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bej_compras_det` ADD CONSTRAINT `bej_compras_det_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `bej_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bej_lista_precios` ADD CONSTRAINT `bej_lista_precios_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `bej_articulos`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bej_prod_formula_comp` ADD CONSTRAINT `bej_prod_formula_comp_formula_fkey` FOREIGN KEY (`formula`) REFERENCES `bej_prod_formulas`(`formula`) ON DELETE RESTRICT ON UPDATE CASCADE;
