-- CreateTable
CREATE TABLE `whatsapp_pedidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `telefono` VARCHAR(20) NOT NULL,
    `estado` VARCHAR(20) NOT NULL,
    `cliCod` VARCHAR(6) NULL,
    `cliRazSoc` VARCHAR(40) NULL,
    `clienteDatos` JSON NOT NULL,
    `carrito` JSON NOT NULL,
    `entrega` JSON NOT NULL,
    `npwNumero` VARCHAR(20) NULL,
    `error` TEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    INDEX `whatsapp_pedidos_telefono_idx`(`telefono`),
    INDEX `whatsapp_pedidos_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_clientes` (
    `telefono` VARCHAR(20) NOT NULL,
    `cliCod` VARCHAR(6) NOT NULL,
    `cliRazSoc` VARCHAR(40) NOT NULL,
    `ultimoUso` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`telefono`, `cliCod`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
