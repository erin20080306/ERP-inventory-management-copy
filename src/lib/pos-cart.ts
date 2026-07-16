import { z } from "zod";

export const PosCartPayloadSchema = z.object({
  version: z.literal(1).default(1),
  items: z.array(z.object({
    product: z.object({
      id: z.string().min(1),
      sku: z.string().min(1).max(100),
      barcode: z.string().max(200).nullable().optional(),
      name: z.string().min(1).max(300),
      spec: z.string().max(300).nullable().optional(),
      salePrice: z.coerce.number().min(0).max(100_000_000),
      stockTotal: z.coerce.number().min(0).max(100_000_000),
      imageUrl: z.string().max(2_000).nullable().optional(),
    }),
    quantity: z.coerce.number().positive().max(100_000),
    discount: z.coerce.number().min(0).max(100_000_000),
  })).max(200),
  customerId: z.string().nullable().optional(),
  paymentLines: z.array(z.object({
    method: z.enum(["CASH", "CARD", "MOBILE", "TRANSFER"]),
    amount: z.string().max(40),
    reference: z.string().max(100),
  })).max(4).optional(),
  invoice: z.object({
    mode: z.enum(["NONE", "PAPER", "MOBILE_CARRIER", "CITIZEN_CERT", "DONATION", "BUSINESS"]),
    buyerTaxId: z.string().max(8).optional(),
    carrierId: z.string().max(64).optional(),
    donationCode: z.string().max(7).optional(),
  }).optional(),
  pendingExchange: z.object({ id: z.string().min(1), number: z.string().min(1) }).nullable().optional(),
  offer: z.object({
    couponCode: z.string().max(30).optional(),
    appliedCoupon: z.record(z.any()).nullable().optional(),
    redeemPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),
    discountApproval: z.record(z.any()).nullable().optional(),
    discountReason: z.string().max(300).optional(),
  }).optional(),
});

export type PosCartPayload = z.infer<typeof PosCartPayloadSchema>;
