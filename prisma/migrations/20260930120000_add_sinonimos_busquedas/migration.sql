-- CreateTable
CREATE TABLE `bej_articulo_sinonimos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sinonimo` VARCHAR(80) NOT NULL,
    `sinonimoNorm` VARCHAR(80) NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `creadoPor` VARCHAR(60) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bej_articulo_sinonimos_sinonimoNorm_idx`(`sinonimoNorm`),
    UNIQUE INDEX `bej_articulo_sinonimos_sinonimoNorm_artCodigo_key`(`sinonimoNorm`, `artCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_busquedas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `telefono` VARCHAR(20) NOT NULL,
    `texto` VARCHAR(200) NOT NULL,
    `textoNorm` VARCHAR(200) NOT NULL,
    `resultados` INTEGER NOT NULL,
    `descartada` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_busquedas_textoNorm_idx`(`textoNorm`),
    INDEX `whatsapp_busquedas_creadoEn_idx`(`creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bej_articulo_sinonimos` ADD CONSTRAINT `bej_articulo_sinonimos_artCodigo_fkey` FOREIGN KEY (`artCodigo`) REFERENCES `bej_articulos`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;

