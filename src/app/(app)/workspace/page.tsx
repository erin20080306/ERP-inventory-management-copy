import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, Calculator, ClipboardList, Package, PackageCheck, ScanBarcode, Shield, ShoppingCart, Store, UtensilsCrossed } from "lucide-react";
import { getSession } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { getProductEdition, normalizeBusinessMode } from "@/lib/product-editions";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600",
  orange: "bg-orange-500/10 text-orange-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
  violet: "bg-violet-500/10 text-violet-600",
  amber: "bg-amber-500/10 text-amber-600",
  rose: "bg-rose-500/10 text-rose-600",
};

export default async function WorkspacePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const mode = normalizeBusinessMode(session.user.businessMode);
  const edition = getProductEdition(mode);
  const permissions = session.user.permissions;
  const isPlatformAdmin = Boolean(session.user.isSuperAdmin);
  if (!isPlatformAdmin) {
    if (mode === "ERP" && hasPermission(permissions, "dashboard.view")) redirect("/dashboard");
    if (mode === "POS_RETAIL" && hasPermission(permissions, "pos.view")) redirect("/pos");
    if (mode === "POS_RESTAURANT" && hasPermission(permissions, "restaurant.view")) redirect("/pos/restaurant");
  }
  const storefrontCode = session.user.companyCode || session.user.tenantId;
  const cards = [
    ...((mode === "ECOMMERCE" || isPlatformAdmin)
      ? [{ title: mode === "ECOMMERCE" ? "預覽我的品牌商城" : "電商租戶網站示範", description: "消費者前台與 ERP 共用商品、可售庫存、會員與網路訂單", href: mode === "ECOMMERCE" ? `/store/${encodeURIComponent(storefrontCode)}` : "/store/atelier-noir", icon: Store, tone: "rose" }]
      : []),
    ...((mode === "ECOMMERCE" || isPlatformAdmin) && hasPermission(permissions, "dashboard.view")
      ? [{ title: "進入 ERP 營運後台", description: "網路訂單、商品、庫存、出貨、應收與會計整合管理", href: "/dashboard", icon: Building2, tone: "indigo" }]
      : []),
    ...((mode === "POS_RETAIL" || isPlatformAdmin) && hasPermission(permissions, "pos.view")
      ? [{ title: "零售 POS 收銀", description: "掃碼、會員、促銷、多元支付、退換貨與日結", href: "/pos", icon: ScanBarcode, tone: "emerald" }]
      : []),
    ...((mode === "POS_RESTAURANT" || isPlatformAdmin) && hasPermission(permissions, "restaurant.view")
      ? [{ title: "餐飲桌位與點餐", description: "圖片點餐、加點、送廚、出餐與桌位結帳", href: "/pos/restaurant", icon: UtensilsCrossed, tone: "orange" }]
      : []),
    ...(hasPermission(permissions, "inventory.view")
      ? [{ title: "進銷存後台", description: "商品、採購、銷售、庫存、調撥與退貨", href: "/inventory", icon: Package, tone: "indigo" }]
      : []),
    ...(hasPermission(permissions, "accounting.view") || hasPermission(permissions, "journals.view")
      ? [{ title: "會計後台", description: "傳票、應收應付、發票、現金銀行與財務報表", href: "/accounting/journals", icon: Calculator, tone: "violet" }]
      : []),
    ...(isPlatformAdmin
      ? [{ title: "平台管理後台", description: "客戶公司、授權、席次、方案與裝置管理", href: "/admin", icon: Shield, tone: "amber" }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl border bg-gradient-to-br from-slate-950 to-slate-900 p-7 text-white shadow-xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs">
              <Building2 className="h-3.5 w-3.5" />{isPlatformAdmin ? "管理者免費內部帳套" : "已鎖定公司業態"}
            </div>
            <h1 className="text-2xl font-black md:text-3xl">{isPlatformAdmin ? "ERP／電商／零售 POS／餐飲 POS 完整功能" : edition.label}</h1>
            <p className="mt-2 text-sm text-slate-300">{isPlatformAdmin ? "艾琳設計內部驗收帳套，永久免費且不會混入付費客戶資料。" : edition.description}</p>
          </div>
          <div className="max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-slate-300">
            畫面依個人角色權限顯示。消費者只使用商城；租戶管理者登入後才可進 ERP。沒有權限的模組同時禁止網址與 API 存取。
          </div>
        </div>
      </section>

      {mode === "ECOMMERCE" && (
        <section className="overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-rose-100 p-6 md:flex-row md:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[.2em] text-rose-600">同一試用租戶・雙視角操作</div>
              <h2 className="mt-2 text-xl font-black text-slate-900">從消費者結帳，到 ERP 接單與出貨</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/store/${encodeURIComponent(storefrontCode)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">進入商店官網 <ArrowUpRight className="h-4 w-4" /></Link>
              <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50">查看 ERP 網路訂單 <ClipboardList className="h-4 w-4" /></Link>
            </div>
          </div>
          <div className="grid gap-px bg-rose-100 md:grid-cols-3">
            <div className="bg-white/90 p-5"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShoppingCart className="h-4 w-4 text-rose-600" />1．模擬一般消費者</div><p className="mt-2 text-xs leading-5 text-slate-600">另開商城、加入商品並送出訂單；試用不會完成真實金流扣款。</p></div>
            <div className="bg-white/90 p-5"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ClipboardList className="h-4 w-4 text-indigo-600" />2．回 ERP 接單</div><p className="mt-2 text-xs leading-5 text-slate-600">在銷售管理看到標示 [WEB] 的新訂單與自動建立／合併的客戶資料。</p></div>
            <div className="bg-white/90 p-5"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><PackageCheck className="h-4 w-4 text-emerald-600" />3．核准與出貨</div><p className="mt-2 text-xs leading-5 text-slate-600">待處理訂單會先保留可售量；完成出貨後才扣實體庫存並銜接應收與傳票。</p></div>
          </div>
        </section>
      )}
      <section>
        <h2 className="text-lg font-bold">選擇工作區</h2>
        <p className="mt-1 text-sm text-muted-foreground">前台與後台分開操作，但交易資料會在同一家公司帳套同步。</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.href} href={card.href} className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONE_CLASSES[card.tone]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 font-bold">{card.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.description}</p>
                <div className="mt-4 text-sm font-semibold text-primary">進入工作區 →</div>
              </Link>
            );
          })}
        </div>
        {cards.length === 0 && <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">此帳號尚未獲得任何工作區權限，請聯絡公司管理員。</div>}
      </section>
    </div>
  );
}
