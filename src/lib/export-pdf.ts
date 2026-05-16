/**
 * 將頁面表格區域匯出為 PDF（支援中文）
 * 使用 html2canvas 將 DOM 轉圖片再寫入 jsPDF，自動分頁
 */
export async function exportPageToPDF(title: string, filename: string) {
  const { default: html2canvas } = await import("html2canvas");
  const { default: jsPDF } = await import("jspdf");
  const { getCompanyInfo } = await import("@/components/print-company-header");

  // 找到主內容區
  const main = document.querySelector("main");
  if (!main) return;

  // 取得公司資訊
  const company = await getCompanyInfo();

  // 建立離螢幕容器，白底、固定寬度
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1100px;padding:24px 32px;background:#fff;color:#000;font-family:sans-serif;";

  // 公司抬頭
  const header = document.createElement("div");
  header.style.cssText = "text-align:center;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #333;";
  const companyName = document.createElement("div");
  companyName.textContent = company.name || "公司名稱";
  companyName.style.cssText = "font-size:20px;font-weight:700;";
  header.appendChild(companyName);
  const companyInfo = document.createElement("div");
  companyInfo.style.cssText = "font-size:10px;color:#444;margin-top:4px;";
  const infoParts: string[] = [];
  if (company.taxId) infoParts.push(`統編：${company.taxId}`);
  if (company.address) infoParts.push(company.address);
  if (company.phone) infoParts.push(`TEL：${company.phone}`);
  if (company.email) infoParts.push(`Email：${company.email}`);
  companyInfo.textContent = infoParts.join("　");
  header.appendChild(companyInfo);
  wrap.appendChild(header);

  // 標題
  const h = document.createElement("h2");
  h.textContent = title;
  h.style.cssText = "font-size:18px;font-weight:700;text-align:center;margin-bottom:4px;";
  wrap.appendChild(h);

  // 日期
  const d = document.createElement("p");
  d.textContent = `列印日期：${new Date().toLocaleDateString("zh-TW")}`;
  d.style.cssText = "font-size:11px;color:#666;text-align:right;margin-bottom:12px;";
  wrap.appendChild(d);

  // 複製內容
  const clone = main.cloneNode(true) as HTMLElement;
  // 移除按鈕、搜尋、分頁等互動元素
  clone.querySelectorAll("button, input, select, textarea, .no-print, [data-no-print]").forEach((el) => el.remove());
  // 移除第一個 flex 工具列（搜尋 + 按鈕列）
  clone.querySelectorAll(".flex.items-center.justify-between").forEach((el) => el.remove());
  // 移除分頁
  clone.querySelectorAll(".flex.items-center.justify-between.text-sm").forEach((el) => el.remove());

  // 表格樣式
  clone.querySelectorAll("table").forEach((t) => {
    t.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";
  });
  clone.querySelectorAll("th,td").forEach((c) => {
    (c as HTMLElement).style.cssText = "border:1px solid #ccc;padding:4px 8px;text-align:left;";
  });
  clone.querySelectorAll("th").forEach((c) => {
    (c as HTMLElement).style.background = "#f3f4f6";
    (c as HTMLElement).style.fontWeight = "600";
  });
  // Card 去邊框
  clone.querySelectorAll("[class*='card']").forEach((c) => {
    (c as HTMLElement).style.cssText = "border:none;box-shadow:none;padding:0;margin-bottom:16px;";
  });
  // 標題
  clone.querySelectorAll("h1").forEach((c) => c.remove()); // 已有頂部標題
  clone.querySelectorAll("h3,[class*='CardTitle']").forEach((c) => {
    (c as HTMLElement).style.cssText = "font-size:14px;font-weight:600;margin:8px 0 4px;";
  });
  // Badge 純文字
  clone.querySelectorAll("[class*='badge']").forEach((c) => {
    (c as HTMLElement).style.cssText = "border:none;background:none;color:#000;padding:0;font-size:11px;";
  });

  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("l", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth() - 20; // 10mm 左右邊距
    const pageH = pdf.internal.pageSize.getHeight() - 20;
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let y = 10;
    let remaining = imgH;

    // 第一頁
    pdf.addImage(imgData, "PNG", 10, y, imgW, imgH);
    remaining -= pageH;

    // 後續頁
    while (remaining > 0) {
      pdf.addPage();
      y -= pageH;
      pdf.addImage(imgData, "PNG", 10, y, imgW, imgH);
      remaining -= pageH;
    }

    pdf.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    document.body.removeChild(wrap);
  }
}
