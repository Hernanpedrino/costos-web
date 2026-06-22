-- CreateTable
CREATE TABLE `bej_articulo_mapeo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigoLili` VARCHAR(20) NOT NULL,
    `codigoCane` VARCHAR(20) NOT NULL,
    `verificado` BOOLEAN NOT NULL DEFAULT false,

    INDEX `bej_articulo_mapeo_codigoCane_idx`(`codigoCane`),
    UNIQUE INDEX `bej_articulo_mapeo_codigoLili_key`(`codigoLili`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
