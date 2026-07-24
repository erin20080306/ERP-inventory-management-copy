import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

type ReceiptItem = { name: string; quantity: number; unitPrice: number; amount: number; kind?: string };

function amount(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value);
}

export default async function MedicalReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const receipt = await prisma.medicalReceipt.findFirst({
    where: { id, ...(session.user.isSuperAdmin ? {} : { tenantId: session.user.tenantId || "__none__" }) },
    include: {
      tenant: { select: { name: true } },
      customer: { select: { companyName: true, phone: true } },
      posSale: { include: { payments: true } },
    },
  });
  if (!receipt) notFound();
  const settings = await prisma.companySetting.findFirst({
    where: { tenantId: receipt.tenantId },
    select: { name: true, address: true, phone: true, taxId: true },
  });
  const medicalItems = (receipt.medicalItems as unknown as ReceiptItem[]) || [];
  const nonMedicalItems = (receipt.nonMedicalItems as unknown as ReceiptItem[] | null) || [];
  const clinicName = settings?.name || receipt.tenant.name;
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-950 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[760px] items-center justify-between print:hidden">
        <div><div className="font-bold">醫療收據預覽</div><div className="text-xs text-stone-500">A5 直式・請核對診所登記資料後列印</div></div>
        <PrintButton />
      </div>
      <article className="mx-auto min-h-[210mm] max-w-[148mm] bg-white p-[12mm] shadow-xl print:min-h-0 print:max-w-none print:shadow-none">
        <header className="border-b-2 border-stone-900 pb-4 text-center">
          <div className="text-2xl font-black tracking-[.08em]">{clinicName}</div>
          <h1 className="mt-2 text-lg font-black tracking-[.25em]">醫療費用收據</h1>
          <div className="mt-3 flex justify-center gap-4 text-[10px] text-stone-500">
            {settings?.address && <span>地址：{settings.address}</span>}
            {settings?.phone && <span>電話：{settings.phone}</span>}
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-b pb-4 text-xs">
          <div><span className="text-stone-500">收據號碼：</span><b>{receipt.number}</b></div>
          <div><span className="text-stone-500">就診日期：</span>{receipt.visitDate.toLocaleDateString("zh-TW")}</div>
          <div><span className="text-stone-500">病患姓名：</span><b>{receipt.patientName}</b></div>
          <div><span className="text-stone-500">病歷號碼：</span>{receipt.medicalRecordNo || "—"}</div>
          <div><span className="text-stone-500">身分證字號：</span>{receipt.patientIdentity || "—"}</div>
          <div><span className="text-stone-500">出生日期／性別：</span>{receipt.birthDate?.toLocaleDateString("zh-TW") || "—"}／{receipt.gender || "—"}</div>
          <div><span className="text-stone-500">科別：</span>{receipt.department}</div>
          <div><span className="text-stone-500">執行醫事人員：</span>{receipt.practitionerName || "—"}</div>
        </section>

        <ReceiptTable title="自費醫療項目" items={medicalItems} emptyText="本次無醫療項目" />
        <ReceiptTable title="非醫療費用／預收款" items={nonMedicalItems} emptyText="本次無非醫療費用" />

        <section className="mt-5 border-y-2 border-stone-900 py-3 text-sm">
          <div className="flex justify-between"><span>自費醫療小計</span><b>NT$ {amount(Number(receipt.medicalAmount))}</b></div>
          <div className="mt-1 flex justify-between"><span>非醫療／預收小計</span><b>NT$ {amount(Number(receipt.nonMedicalAmount))}</b></div>
          <div className="mt-3 flex justify-between text-xl font-black"><span>應收總額</span><span>NT$ {amount(Number(receipt.total))}</span></div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-4 text-xs">
          <div><span className="text-stone-500">付款方式：</span>{receipt.posSale?.payments.map((item) => item.method).join("＋") || "儲值／其他"}</div>
          <div><span className="text-stone-500">經收人：</span>{receipt.issuedByName}</div>
          <div><span className="text-stone-500">開立時間：</span>{receipt.issuedAt.toLocaleString("zh-TW")}</div>
          <div><span className="text-stone-500">收據狀態：</span>{receipt.status === "ISSUED" ? "已開立" : "已作廢"}</div>
        </section>

        <footer className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
          <div className="border-t pt-2">診所收訖章</div>
          <div className="border-t pt-2">經收人簽章</div>
        </footer>
        <p className="mt-8 border-t pt-3 text-[9px] leading-4 text-stone-500">本收據依本次實際收費分列自費醫療與非醫療／預收項目；如有作廢或退款，應以系統留存之稽核紀錄為準。本收據未就個人所得稅列舉扣除資格作任何保證。</p>
      </article>
    </main>
  );
}

function ReceiptTable({ title, items, emptyText }: { title: string; items: ReceiptItem[]; emptyText: string }) {
  return (
    <section className="mt-4">
      <h2 className="mb-2 text-xs font-black tracking-[.16em]">{title}</h2>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="border-y bg-stone-50 text-stone-500"><th className="p-2 text-left">項目</th><th className="w-14 text-right">數量</th><th className="w-24 text-right">單價</th><th className="w-24 p-2 text-right">金額</th></tr></thead>
        <tbody>
          {items.map((item, index) => <tr key={`${item.name}-${index}`} className="border-b"><td className="p-2">{item.name}</td><td className="text-right">{item.quantity}</td><td className="text-right">{amount(item.unitPrice)}</td><td className="p-2 text-right font-bold">{amount(item.amount)}</td></tr>)}
          {!items.length && <tr><td colSpan={4} className="p-3 text-center text-stone-400">{emptyText}</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
