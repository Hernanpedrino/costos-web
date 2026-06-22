-- AlterTable
ALTER TABLE `formula` ADD COLUMN `codigoBejerman` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `insumo` ADD COLUMN `codigoBejerman` VARCHAR(20) NULL;

-- CreateIndex
CREATE INDEX `Formula_codigoBejerman_idx` ON `Formula`(`codigoBejerman`);

-- CreateIndex
CREATE INDEX `Insumo_codigoBejerman_idx` ON `Insumo`(`codigoBejerman`);
