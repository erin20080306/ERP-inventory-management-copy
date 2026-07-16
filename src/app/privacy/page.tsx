import Link from "next/link";

export default function PrivacyPage() {
  return <LegalPage title="隱私權政策" updated="2026 年 7 月 16 日">
    <p>本政策說明「艾琳設計 ERP／POS 系統」為提供試用、授權、客服及系統安全，如何蒐集、處理與利用資料。</p>
    <h2>一、蒐集者與聯絡方式</h2><p>服務名稱：艾琳設計 ERP／POS 系統。個資事項聯絡信箱：<a href="mailto:erin20080306@gmail.com">erin20080306@gmail.com</a>。</p>
    <h2>二、蒐集目的與資料類別</h2><p>我們可能蒐集姓名、公司或店名、帳號、Email、Line ID、登入 IP、裝置平台、經雜湊處理的裝置識別碼、登入及操作稽核紀錄、方案與授權狀態，以及使用者自行輸入的商品、客戶、供應商、交易與會計資料。用途包括帳號與權限管理、3 日試用、授權席次驗證、ERP／POS 功能、備份、客服、資安與依法配合。</p>
    <h2>三、利用期間、地區、對象與方式</h2><p>資料於帳號或契約有效期間及法律、稅務、爭議處理或備份所需期間保存；主要在服務及受委託雲端服務所在地，以自動化或必要人工方式處理。雲端版本可能使用 Vercel、資料庫、Email 寄送及 AI 供應商；本機版的營運資料原則上保存在客戶環境，但授權狀態與雜湊裝置資料會與中央管理端連線。</p>
    <h2>四、當事人權利</h2><p>你可透過上述信箱請求查詢或閱覽、製給複製本、補充或更正、停止蒐集處理利用或刪除。若法律或契約要求必須保存，我們會說明無法立即刪除的原因。台灣個資法列出的權利可參考<a href="https://www.pdpc.gov.tw/News_Content/100/290/" target="_blank" rel="noreferrer">個人資料保護委員會籌備處第 3 條說明</a>。</p>
    <h2>五、不提供資料的影響</h2><p>不提供帳號、聯絡或必要授權資料時，可能無法建立帳號、回覆諮詢、驗證席次或提供服務。選填欄位不影響基本使用。</p>
    <h2>六、安全與付款資料</h2><p>系統採權限控管、伺服器時間、授權事件雜湊鏈及裝置識別碼雜湊等措施；任何系統仍無法承諾零風險。本站不提供原有付款連結，也不要求在網站表單填寫信用卡或網銀密碼；付款由雙方聯絡確認。</p>
    <h2>七、告知內容</h2><p>蒐集個資時應告知的法定事項，可參考<a href="https://www.pdpc.gov.tw/News_Content/100/295/" target="_blank" rel="noreferrer">個人資料保護委員會籌備處第 8 條說明</a>。政策如有重要變更，會在網站公布更新日期。</p><p><Link href="/terms">產品服務條款</Link>・<Link href="/refund">退款政策</Link></p>
  </LegalPage>;
}

function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-200"><article className="prose prose-invert mx-auto max-w-3xl prose-headings:text-white prose-h2:mt-9 prose-h2:text-xl prose-p:leading-7 prose-a:text-indigo-300"><Link href="/login" className="no-underline">← 返回登入</Link><h1>{title}</h1><p className="text-sm text-slate-500">最後更新：{updated}</p>{children}</article></main>;
}
