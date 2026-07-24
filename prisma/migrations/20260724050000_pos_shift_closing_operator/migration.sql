ALTER TABLE "PosShift" ADD COLUMN "closedById" TEXT;

CREATE INDEX "PosShift_closedById_idx" ON "PosShift"("closedById");
