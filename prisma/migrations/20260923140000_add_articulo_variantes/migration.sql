-- CreateTable
CREATE TABLE `bej_articulo_variantes` (
    `codGen` VARCHAR(20) NOT NULL,
    `codEle1` VARCHAR(10) NOT NULL,
    `codEle2` VARCHAR(10) NOT NULL,
    `codEle3` VARCHAR(10) NOT NULL,
    `desc1` VARCHAR(50) NOT NULL,
    `desc2` VARCHAR(50) NOT NULL,
    `desc3` VARCHAR(50) NOT NULL,
    `precioFin` DECIMAL(15, 2) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bej_articulo_variantes_codGen_idx`(`codGen`),
    PRIMARY KEY (`codGen`, `codEle1`, `codEle2`, `codEle3`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bej_articulo_variantes` ADD CONSTRAINT `bej_articulo_variantes_codGen_fkey` FOREIGN KEY (`codGen`) REFERENCES `bej_articulos`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;
