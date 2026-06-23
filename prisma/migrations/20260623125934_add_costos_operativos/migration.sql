-- CreateTable
CREATE TABLE `costo_categoria` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(50) NOT NULL,
    `tipo` ENUM('FIJO', 'VARIABLE') NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `costo_categoria_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `costo_registro` (
    `id` VARCHAR(191) NOT NULL,
    `categoriaId` VARCHAR(191) NOT NULL,
    `periodo` VARCHAR(7) NOT NULL,
    `importe` DECIMAL(15, 2) NOT NULL,
    `nota` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `costo_registro_periodo_idx`(`periodo`),
    UNIQUE INDEX `costo_registro_categoriaId_periodo_key`(`categoriaId`, `periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `costo_registro` ADD CONSTRAINT `costo_registro_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `costo_categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
