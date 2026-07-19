"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronUp, FileText, ShieldCheck } from "lucide-react";
import { LaborReportPreview } from "@/components/labor-report-preview";
import { formatTwd, type BillingCycle } from "@/lib/plans";

type BillingDocumentNoticeProps = {
  companyName?: string;
  planName: string;
  billing: BillingCycle;
  amount: number;
};

export function BillingDocumentNotice({ companyName, planName, billing, amount }: BillingDocumentNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.10] via-white/[0.04] to-indigo-400/[0.08] shadow-2xl shadow-black/20">
      <div className="grid gap-6 p-6 md:grid-cols-[1.15fr_.85fr] md:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-bold tracking-wide text-amber-200">
            <ShieldCheck className="h-4 w-4" />付款憑證與申報文件說明
          </div>
          <h2 className="mt-4 text-2xl font-black">本服務目前未提供統一發票</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            可提供服務合約及勞務報酬單（勞報單），供貴司會計依適用規定辦理申報及費用列支。
          </p>

          <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 font-semibold text-white"><FileText className="h-4 w-4 text-amber-300" />付款後寄送文件</div>
              <p className="mt-2 text-xs leading-6 text-slate-400">確認付款後，艾琳設計會將正式合約與勞報單寄至貴司指定 Email。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 font-semibold text-white"><Building2 className="h-4 w-4 text-sky-300" />請先提供相關資訊</div>
              <p className="mt-2 text-xs leading-6 text-slate-400">請聯絡艾琳設計，提供公司抬頭、統編、地址、聯絡人及收件 Email 等必要資料。</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-6 text-slate-500">實際申報、扣繳、補充保費及費用列支方式，請由貴司會計或稅務專業人員依適用規定判斷。</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div>
            <FileText className="h-9 w-9 text-indigo-300" />
            <h3 className="mt-4 text-lg font-bold">事先預覽勞報單格式</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">預覽會依目前選擇的方案與付款方式帶入示意金額，不顯示個人敏感資料。</p>
            <div className="mt-4 rounded-xl bg-white/[0.05] p-3 text-xs text-slate-400">
              <div>目前方案：<span className="font-semibold text-white">{planName}</span></div>
              <div className="mt-1">示意金額：<span className="font-semibold text-emerald-300">{formatTwd(amount)}</span></div>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="labor-report-preview"
            onClick={() => setOpen((value) => !value)}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-bold text-slate-950 transition hover:bg-slate-100"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {open ? "收合勞報單預覽" : "打開勞報單預覽"}
          </button>
        </div>
      </div>

      {open && (
        <div id="labor-report-preview" className="border-t border-white/10 bg-slate-950/45 p-4 md:p-8">
          <LaborReportPreview companyName={companyName} planName={planName} billing={billing} amount={amount} />
        </div>
      )}
    </section>
  );
}
