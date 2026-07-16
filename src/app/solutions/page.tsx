import Link from "next/link";
import { ArrowRight, Building2, Check, Download, MonitorSmartphone, ScanLine, Store, UtensilsCrossed } from "lucide-react";

const solutions = [
  {
    mode: "ERP",
    eyebrow: "一般企業",
    title: "進銷存會計 ERP",
    description: "以單據與內控為核心，完整串起採購、銷售、庫存、應收應付、發票與會計傳票。",
    icon: Building2,
    accent: "from-indigo-500 to-sky-500",
    points: ["報價 → 訂單 → 出貨 → 立帳 → 收款", "請購／採購 → 進貨 → 應付 → 付款", "盤點、調撥、成本與財務報表"],
  },
  {
    mode: "POS_RETAIL",
    eyebrow: "零售門市",
    title: "零售 POS＋進銷存＋會計",
    description: "以收銀速度與離線不中斷為核心，門市交易即時同步總部 ERP、庫存與帳務。",
    icon: Store,
    accent: "from-emerald-500 to-teal-500",
    points: ["開班 → 掃碼／選品 → 結帳 → 列印", "退換貨、會員、促銷與多元支付", "日結 → 庫存扣帳 → 營收與傳票"],
  },
  {
    mode: "POS_RESTAURANT",
    eyebrow: "餐飲門市",
    title: "桌位點餐＋廚房＋進銷存＋會計",
    description: "以圖片點餐、桌位與廚房出單為核心，結帳後沿用同一套庫存扣帳與會計流程。",
    icon: UtensilsCrossed,
    accent: "from-orange-500 to-rose-500",
    points: ["開桌 → 圖片點餐 → 送廚 → 製作／出餐", "桌位狀態、加點、備註與廚房看板", "結帳 → 庫存扣帳 → 營收與傳票"],
  },
] as const;

export default function SolutionsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/70 via-slate-950 to-emerald-950/60" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-5 py-10 md:py-16">
        <header className="flex items-center justify-between gap-4 mb-14">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <MonitorSmartphone className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-bold">艾琳設計 ERP</span>
              <span className="block text-xs text-slate-400">本機優先・安全連線</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/plans" className="text-slate-300 hover:text-white transition">方案價格</Link>
            <Link href="/terms" className="hidden text-slate-300 hover:text-white transition sm:inline">產品條款</Link>
            <Link href="/login" className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition">登入</Link>
          </div>
        </header>

        <section className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-full px-3 py-1.5 mb-5">
            <ScanLine className="h-3.5 w-3.5" />先選擇工作流程，再建立公司帳號
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">你要管理哪一種營運現場？</h1>
          <p className="text-slate-400 mt-4 leading-7">三種業態共用商品、庫存、帳務與 AI；操作順序、首頁與快捷鍵會依企業辦公、零售收銀或餐飲桌位情境調整。每家公司開通時只能選擇一種業態。</p>
        </section>

        <section className="mb-8 grid gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 text-sm md:grid-cols-3">
          <div><div className="font-semibold text-sky-200">線上只供試用</div><p className="mt-1 text-xs leading-5 text-slate-400">建立公司帳號後可完整試用 3 日，到期保留資料並封鎖操作。</p></div>
          <div><div className="flex items-center gap-2 font-semibold text-sky-200"><Download className="h-4 w-4" />正式版下載安裝</div><p className="mt-1 text-xs leading-5 text-slate-400">聯絡確認付款後，才開通 macOS／Windows 公司主機與工作站安裝包。</p></div>
          <div><div className="font-semibold text-sky-200">席次由中央授權</div><p className="mt-1 text-xs leading-5 text-slate-400">2／3／5／8 台方案依實際綁定電腦計算，換機須先撤銷舊裝置。</p></div>
        </section>

        <section className="grid md:grid-cols-3 gap-5 md:gap-7">
          {solutions.map((solution) => {
            const Icon = solution.icon;
            return (
              <article key={solution.mode} className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${solution.accent} flex items-center justify-center shadow-lg mb-6`}>
                  <Icon className="h-7 w-7" />
                </div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{solution.eyebrow}</p>
                <h2 className="text-2xl font-bold mt-2">{solution.title}</h2>
                <p className="text-sm text-slate-400 leading-6 mt-3 min-h-12">{solution.description}</p>
                <ul className="space-y-3 my-7 text-sm text-slate-200">
                  {solution.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/register?mode=${solution.mode}`}
                  className={`w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r ${solution.accent} text-white font-bold shadow-lg hover:brightness-110 transition`}
                >
                  選擇{solution.eyebrow}模式 <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span>3 日完整試用</span>
          <span>付款後由艾琳設計人工確認開通</span>
          <Link href="/privacy" className="hover:text-slate-300">隱私權政策</Link>
          <Link href="/terms" className="hover:text-slate-300">服務條款與聲明</Link>
          <Link href="/refund" className="hover:text-slate-300">退款政策</Link>
        </footer>
      </div>
    </main>
  );
}
