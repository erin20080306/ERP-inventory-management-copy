import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Calculator, Package, ScanBarcode, Shield, UtensilsCrossed } from "lucide-react";
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
};

export default async function WorkspacePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const mode = normalizeBusinessMode(session.user.businessMode);
  const edition = getProductEdition(mode);
  const permissions = session.user.permissions;
  const isPlatformAdmin = Boolean(session.user.isSuperAdmin);
  const cards = [
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
            <h1 className="text-2xl font-black md:text-3xl">{isPlatformAdmin ? "ERP／零售 POS／餐飲 POS 完整功能" : edition.label}</h1>
            <p className="mt-2 text-sm text-slate-300">{isPlatformAdmin ? "艾琳設計內部驗收帳套，永久免費且不會混入付費客戶資料。" : edition.description}</p>
          </div>
          <div className="max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-slate-300">
            畫面依個人角色權限顯示。POS、進銷存與會計可分開授權；沒有權限的模組同時禁止網址與 API 存取。
          </div>
        </div>
      </section>

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
