"use client";
import { useEffect, useState } from "react";

type CompanyInfo = {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
};

let cached: CompanyInfo | null = null;

export function PrintCompanyHeader() {
  const [info, setInfo] = useState<CompanyInfo | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        cached = d.company ?? {};
        setInfo(cached);
      })
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <div className="print-company-header hidden print:block text-center mb-4">
      <div className="text-lg font-bold">{info.name || "公司名稱"}</div>
      <div className="text-xs text-gray-600 mt-1">
        {info.taxId && <span>統編：{info.taxId}　</span>}
        {info.address && <span>{info.address}　</span>}
        {info.phone && <span>TEL：{info.phone}　</span>}
        {info.email && <span>Email：{info.email}</span>}
      </div>
    </div>
  );
}

/** 取得公司資訊（for PDF export） */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  if (cached) return cached;
  try {
    const res = await fetch("/api/settings");
    const d = await res.json();
    cached = d.company ?? {};
    return cached!;
  } catch {
    return {};
  }
}
