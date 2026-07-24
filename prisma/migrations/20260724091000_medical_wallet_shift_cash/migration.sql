-- 將醫美會員儲值收款綁定 POS 班次，現金儲值才能納入該班應有現金與結班差額。
ALTER TABLE "MedicalWalletTransaction" ADD COLUMN "shiftId" TEXT;

CREATE INDEX "MedicalWalletTransaction_shiftId_createdAt_idx"
  ON "MedicalWalletTransaction"("shiftId", "createdAt");

ALTER TABLE "MedicalWalletTransaction"
  ADD CONSTRAINT "MedicalWalletTransaction_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
