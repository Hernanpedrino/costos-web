-- AlterTable
ALTER TABLE `registroaccion` MODIFY `entidad` ENUM('Insumo', 'Formula', 'Usuario', 'Produccion') NOT NULL;

-- CreateTable
CREATE TABLE `planilla_produccion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `estado` VARCHAR(12) NOT NULL DEFAULT 'borrador',
    `observacion` TEXT NULL,
    `creadoPor` VARCHAR(60) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmadaEn` DATETIME(3) NULL,
    `procesadaEn` DATETIME(3) NULL,

    UNIQUE INDEX `planilla_produccion_fecha_key`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `planilla_produccion_lineas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planillaId` INTEGER NOT NULL,
    `productoCod` VARCHAR(20) NOT NULL,
    `productoDesc` VARCHAR(50) NOT NULL,
    `lote` VARCHAR(26) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,
    `formulaCod` VARCHAR(32) NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `ordenBej` INTEGER NULL,
    `nroCompBej` VARCHAR(8) NULL,
    `procesadaEn` DATETIME(3) NULL,
    `error` TEXT NULL,

    INDEX `planilla_produccion_lineas_planillaId_idx`(`planillaId`),
    INDEX `planilla_produccion_lineas_productoCod_idx`(`productoCod`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_conversaciones` (
    `telefono` VARCHAR(191) NOT NULL,
    `nombreContacto` VARCHAR(191) NULL,
    `estadoActual` VARCHAR(191) NOT NULL DEFAULT 'MENU_PRINCIPAL',
    `carritoActual` JSON NULL,
    `contexto` JSON NULL,
    `ultimaInteraccion` DATETIME(3) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`telefono`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_mensajes` (
    `id` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `direccion` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `contenido` JSON NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_mensajes_telefono_idx`(`telefono`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `planilla_produccion_lineas` ADD CONSTRAINT `planilla_produccion_lineas_planillaId_fkey` FOREIGN KEY (`planillaId`) REFERENCES `planilla_produccion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
