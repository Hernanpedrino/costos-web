-- CreateTable
CREATE TABLE `bej_prod_formula_producidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `formula` VARCHAR(32) NOT NULL,
    `artCodigo` VARCHAR(20) NOT NULL,
    `cantidad` DECIMAL(15, 4) NOT NULL,

    INDEX `bej_prod_formula_producidos_formula_idx`(`formula`),
    INDEX `bej_prod_formula_producidos_artCodigo_idx`(`artCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bej_prod_formula_producidos` ADD CONSTRAINT `bej_prod_formula_producidos_formula_fkey` FOREIGN KEY (`formula`) REFERENCES `bej_prod_formulas`(`formula`) ON DELETE RESTRICT ON UPDATE CASCADE;
