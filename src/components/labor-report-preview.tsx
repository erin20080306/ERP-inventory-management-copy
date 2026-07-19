"use client";

import { FileText, ShieldCheck } from "lucide-react";
import { BILLING_LABELS, formatTwd, type BillingCycle } from "@/lib/plans";

type LaborReportPreviewProps = {
  companyName?: string;
  planName: string;
  billing: BillingCycle;
  amount: number;
};

export function LaborReportPreview({ companyName, planName, billing, amount }: LaborReportPreviewProps) {
  const today = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1.5 text-indigo-100">
          <FileText className="h-4 w-4" />勞務報酬單格式預覽
        </div>
        <div className="inline-flex items-center gap-2 text-amber-200">
          <ShieldCheck className="h-4 w-4" />僅供預覽，非正式報稅文件
        </div>
      </div>

      <article className="relative overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-2xl shadow-black/30">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="-rotate-12 whitespace-nowrap text-5xl font-black tracking-[0.18em] text-slate-900/[0.045] md:text-7xl">
            格式預覽
          </div>
        </div>

        <div className="relative border-b-4 border-slate-900 px-6 py-6 md:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-slate-500">ERIN DESIGN</p>
              <h3 className="mt-2 text-2xl font-black tracking-[0.12em] md:text-3xl">勞務報酬單</h3>
              <p className="mt-2 text-xs text-slate-500">Individual Service Remuneration Statement</p>
            </div>
            <div className="text-left text-xs leading-6 text-slate-600 sm:text-right">
              <div>文件編號：ERIN-DEMO-YYYYMM-001</div>
              <div>填表日期：{today}</div>
            </div>
          </div>
        </div>

        <div className="relative grid gap-px bg-slate-300 text-sm md:grid-cols-2">
          <PreviewCell label="給付單位／公司名稱" value={companyName?.trim() || "貴司公司抬頭（待提供）"} />
          <PreviewCell label="統一編號" value="XXXXXXXX（待提供）" />
          <PreviewCell label="地址" value="公司登記地址（待提供）" />
          <PreviewCell label="聯絡人／Email" value="聯絡人及收件信箱（待提供）" />
          <PreviewCell label="所得人姓名" value="艾琳設計服務提供人資料（正式文件填列）" />
          <PreviewCell label="身分證字號／居留證號" value="正式文件依必要範圍提供" sensitive />
        </div>

        <div className="relative px-6 py-6 md:px-10 md:py-8">
          <h4 className="text-sm font-black tracking-wider text-slate-900">勞務內容與報酬明細</h4>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-300">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">項目</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">說明</th>
                  <th className="px-4 py-3 text-right font-semibold">金額</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="px-4 py-4 font-semibold">ERP 系統設計與授權服務</td>
                  <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">{planName}・{BILLING_LABELS[billing]}</td>
                  <td className="px-4 py-4 text-right font-bold">{formatTwd(amount)}</td>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">扣繳稅額</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">依給付日、所得類別及適用規定計算</td>
                  <td className="px-4 py-3 text-right text-slate-500">正式文件計算</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="px-4 py-3 text-slate-600">補充保險費</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">如符合適用條件，由貴司會計依規定辦理</td>
                  <td className="px-4 py-3 text-right text-slate-500">正式文件計算</td>
                </tr>
                <tr className="bg-amber-50">
                  <td className="px-4 py-4 font-black">實付淨額</td>
                  <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">依實際扣繳結果確認</td>
                  <td className="px-4 py-4 text-right text-lg font-black text-amber-800">正式文件確認</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SignatureBox title="所得人簽章" hint="正式勞報單簽署欄位" />
            <SignatureBox title="給付單位經辦／核章" hint="依貴司內部流程辦理" />
          </div>

          <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
            <strong className="text-slate-900">格式說明：</strong>
            本預覽僅展示版面與常見欄位。正式合約與勞務報酬單會依雙方確認的公司資料、服務內容、給付日期及適用稅務規定製作；實際申報、扣繳及費用列支方式，請由貴司會計或稅務專業人員判斷。
          </div>
        </div>
      </article>
    </div>
  );
}

function PreviewCell({ label, value, sensitive = false }: { label: string; value: string; sensitive?: boolean }) {
  return (
    <div className="min-h-24 bg-white px-6 py-4 md:px-8">
      <div className="text-[11px] font-bold tracking-wider text-slate-500">{label}</div>
      <div className={`mt-3 font-semibold ${sensitive ? "text-slate-400" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function SignatureBox({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="min-h-32 rounded-xl border border-dashed border-slate-400 p-4">
      <div className="text-xs font-bold tracking-wider text-slate-700">{title}</div>
      <div className="mt-12 border-t border-slate-300 pt-2 text-xs text-slate-400">{hint}</div>
    </div>
  );
}
