import Link from "next/link";

export default function RefundPage() {
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-200"><article className="prose prose-invert mx-auto max-w-3xl prose-headings:text-white prose-h2:mt-9 prose-h2:text-xl prose-p:leading-7 prose-li:leading-7">
    <Link href="/login" className="no-underline">← 返回登入</Link>
    <h1>退款政策</h1>
    <p className="text-sm text-slate-500">最後更新日期：2026 年 7 月 16 日</p>
    <p>本服務提供試用功能，建議使用者在購買前先確認系統功能、裝置需求及使用方式是否符合需求。</p>

    <div className="not-prose mt-6 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100">
      <strong>法定權利優先：</strong>本政策不限制消費者依法享有且不得以契約排除的解除、瑕疵擔保或其他權利。若服務依法屬可排除 7 日解除權的數位內容、立即完成線上服務或客製化給付，仍須在提供前完成法定告知並取得必要同意。
    </div>

    <h2>訂閱取消</h2>
    <p>目前付款採聯絡後人工確認，尚未啟用網站自動扣款；若未來啟用定期扣款，將於付款前另行明確告知。</p>
    <p>使用者可隨時取消月繳或年繳訂閱。取消後，服務仍可使用至目前已付款週期結束，下一期將不再自動扣款。</p>
    <p>取消訂閱不代表自動退還目前訂閱週期已支付的款項。</p>

    <h2>首次購買退款</h2>
    <p>若為首次購買，且符合以下條件，可於付款後 7 日內提出退款申請：</p>
    <ol><li>使用者遇到無法正常使用的重大技術問題。</li><li>經客服協助後仍無法排除問題。</li><li>使用者未大量使用、下載、匯出或濫用本服務功能。</li></ol>
    <p>退款申請須提供購買帳號、交易資料及問題說明。</p>

    <h2>不適用退款的情況</h2>
    <p>以下情況原則上不提供退款；但法律另有強制規定者，從其規定：</p>
    <ol><li>已超過退款申請期限。</li><li>忘記取消自動續訂。</li><li>因個人需求改變、操作習慣或未詳閱功能說明而提出退款。</li><li>已大量使用、匯出資料、下載安裝檔或使用付費額度。</li><li>因使用者裝置、網路、第三方軟體或非本服務可控制因素造成的問題。</li><li>違反使用條款、濫用服務或帳號遭停權。</li></ol>

    <h2>重複扣款或非本人交易</h2>
    <p>若發生重複扣款、金額錯誤或疑似未授權交易，請立即聯絡客服。我們將配合付款平台進行調查與處理。</p>

    <h2>退款處理</h2>
    <p>核准的退款將透過原付款方式退回。實際入帳時間依付款平台、信用卡公司或銀行作業時間而定。</p>
    <p>付款平台基於法律、消費者保護、支付網路規則、詐欺防範或拒付風險，可能另行決定是否退款。</p>

    <h2>聯絡方式</h2>
    <p>如需申請退款，請透過網站客服或官方聯絡信箱 <a href="mailto:erin20080306@gmail.com">erin20080306@gmail.com</a> 提出申請。</p>
    <p><Link href="/terms">查看產品服務條款</Link>・<Link href="/privacy">查看隱私權政策</Link></p>
  </article></main>;
}
