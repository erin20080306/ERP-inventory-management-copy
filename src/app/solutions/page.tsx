import Link from "next/link";
import { ArrowRight, Building2, Calculator, Check, Download, MonitorSmartphone, ScanLine, ShoppingBag, ShoppingCart, Store, UtensilsCrossed, Workflow } from "lucide-react";

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
    mode: "ECOMMERCE",
    eyebrow: "電商品牌",
    title: "品牌商城＋ERP",
    description: "以品牌官網與網路訂單為核心，商城商品、庫存、會員、出貨與商家 ERP 自動連動。",
    icon: ShoppingBag,
    accent: "from-amber-400 to-rose-500",
    points: ["官網上架 → 購物車 → 付款 → 訂單", "商城會員、優惠券、CRM 與訂單查詢", "網路訂單 → 保留庫存 → 出貨與報表"],
    secondaryLinks: [{ href: "/store/atelier-noir", label: "客人端商城試用" }, { href: "/login", label: "商家 ERP 登入" }],
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

const expertiseHighlights = [
  {
    title: "資深財會經驗打造",
    description: "從進銷存、應收應付到會計傳票，以實際帳務邏輯串好每一步。",
    icon: Calculator,
    iconClass: "border-indigo-300/20 bg-indigo-400/10 text-indigo-200",
  },
  {
    title: "豐富電商經驗團隊",
    description: "官網訂單、會員、庫存、出貨與 ERP 共用資料，減少重複輸入與對帳。",
    icon: ShoppingCart,
    iconClass: "border-amber-300/20 bg-amber-400/10 text-amber-200",
  },
  {
    title: "專業人士打造流程",
    description: "把複雜規則整理成清楚步驟、提醒與權限，團隊不用先成為系統專家。",
    icon: Workflow,
    iconClass: "border-sky-300/20 bg-sky-400/10 text-sky-200",
  },
  {
    title: "餐飲與財務一次解決",
    description: "點餐、送廚、結帳、扣庫存與入帳一路連動，不必在多套工具間來回。",
    icon: UtensilsCrossed,
    iconClass: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
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
            <Link href="/store/atelier-noir" className="hidden text-amber-200 hover:text-white transition md:inline">服飾商城試用</Link>
            <Link href="/plans" className="text-slate-300 hover:text-white transition">方案價格</Link>
            <Link href="/terms" className="hidden text-slate-300 hover:text-white transition sm:inline">產品條款</Link>
            <Link href="/login" className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition">登入</Link>
          </div>
        </header>

        <section className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-full px-3 py-1.5 mb-5">
            <ScanLine className="h-3.5 w-3.5" />POS、ERP 與品牌商城一次試用
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">你要管理哪一種營運現場？</h1>
          <p className="text-slate-400 mt-4 leading-7">四種業態共用商品、庫存、帳務與 AI；操作順序、首頁與快捷鍵會依企業辦公、電商品牌、零售收銀或餐飲桌位情境調整。每家公司開通時只能選擇一種業態。</p>
        </section>

        <section className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl md:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative">
            <div className="mb-5 max-w-3xl">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">懂實務，流程才真正好用</div>
              <h2 className="text-2xl font-black tracking-tight md:text-3xl">不是多一套軟體，而是少一堆繁複工作</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">由具財會與電商實務經驗的團隊，把企業、商城、零售與餐飲最常卡住的作業，整理成一套清楚、連續、容易上手的流程。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {expertiseHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="group rounded-2xl border border-white/10 bg-slate-950/45 p-4 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-950/60">
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${item.iconClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold text-slate-100">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{item.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 text-sm md:grid-cols-3">
          <div><div className="font-semibold text-sky-200">線上只供試用</div><p className="mt-1 text-xs leading-5 text-slate-400">建立公司帳號後可完整試用 3 日，到期保留資料並封鎖操作。</p></div>
          <div><div className="flex items-center gap-2 font-semibold text-sky-200"><Download className="h-4 w-4" />正式版下載安裝</div><p className="mt-1 text-xs leading-5 text-slate-400">聯絡確認付款後，才開通 macOS／Windows 公司主機與工作站安裝包。</p></div>
          <div><div className="font-semibold text-sky-200">席次由中央授權</div><p className="mt-1 text-xs leading-5 text-slate-400">2／3／5／8 台方案依實際綁定電腦計算；換機輸入同一啟用碼即自動移轉最久未使用席次。</p></div>
        </section>

        <div className="mb-3 flex items-center justify-between gap-4 text-xs text-slate-400">
          <span>四種業態皆使用相同租戶註冊與授權流程</span>
          <span className="shrink-0 text-sky-200">左右滑動查看 →</span>
        </div>
        <section className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:thin]" aria-label="四種營運業態">
          {solutions.map((solution) => {
            const Icon = solution.icon;
            return (
              <article key={solution.mode} className="flex min-w-[min(86vw,360px)] snap-start flex-col rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl md:min-w-[340px] md:p-8">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${solution.accent} flex items-center justify-center shadow-lg mb-6`}>
                  <Icon className="h-7 w-7" />
                </div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{solution.eyebrow}</p>
                <h2 className="text-2xl font-bold mt-2">{solution.title}</h2>
                <p className="text-sm text-slate-400 leading-6 mt-3 min-h-12">{solution.description}</p>
                <ul className="my-7 flex-1 space-y-3 text-sm text-slate-200">
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
                {"secondaryLinks" in solution && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    {solution.secondaryLinks.map((link) => <Link key={link.href} href={link.href} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-slate-300 transition hover:bg-white/10 hover:text-white">{link.label}</Link>)}
                  </div>
                )}
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
