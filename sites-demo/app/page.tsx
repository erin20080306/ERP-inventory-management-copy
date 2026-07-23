"use client";

import { useEffect, useState } from "react";

type StoreView = "home" | "member" | "orders";
type CartLine = { id: string; name: string; price: number; image: string; qty: number; meta: string };

const apparel = [
  { id: "AN-101", name: "雲感落肩襯衫", price: 1680, meta: "霧白 / M", stock: 18, badge: "本週新品", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=82" },
  { id: "AN-204", name: "輪廓打褶寬褲", price: 2280, meta: "岩黑 / M", stock: 7, badge: "低庫存", image: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=800&q=82" },
  { id: "AN-306", name: "日常織紋針織衫", price: 1880, meta: "燕麥 / F", stock: 24, badge: "", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=800&q=82" },
  { id: "AN-408", name: "方形皮革肩背包", price: 2680, meta: "可可 / F", stock: 12, badge: "人氣補貨", image: "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=800&q=82" },
];


const formatMoney = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
}).format(value);

export default function Home() {
  const [storeView, setStoreView] = useState<StoreView>("home");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("erin-commerce-demo-cart");
      if (saved) setCart(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem("erin-commerce-demo-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function addStoreItem(item: typeof apparel[number]) {
    setCart((current) => {
      const found = current.find((line) => line.id === item.id);
      return found
        ? current.map((line) => line.id === item.id ? { ...line, qty: line.qty + 1 } : line)
        : [...current, { id: item.id, name: item.name, price: item.price, image: item.image, meta: item.meta, qty: 1 }];
    });
    setCartOpen(true);
    setToast(`${item.name} 已加入購物車`);
  }

  function updateLines(setter: React.Dispatch<React.SetStateAction<CartLine[]>>, id: string, delta: number) {
    setter((current) => current
      .map((line) => line.id === id ? { ...line, qty: line.qty + delta } : line)
      .filter((line) => line.qty > 0));
  }

  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);

  return (
    <div className="app mode-store">
      <header className="topbar">
        <button className="logo" onClick={() => setStoreView("home")}>
          <span>ERIN</span>
          <small>COMMERCE OS</small>
        </button>
        <div className="consumer-scope">消費者商城試用</div>
        <div className="tenant-pill"><i />ATELIER-NOIR ・ 展示模式</div>
      </header>

      <StoreDemo
        view={storeView}
        setView={setStoreView}
        cartCount={cartCount}
        openCart={() => setCartOpen(true)}
        addItem={addStoreItem}
      />

      <CartDrawer
        open={cartOpen}
        close={() => setCartOpen(false)}
        lines={cart}
        total={cartTotal}
        update={(id, delta) => updateLines(setCart, id, delta)}
        checkout={() => {
          setCart([]);
          setCartOpen(false);
          setStoreView("orders");
          setToast("展示訂單已建立；不會寫入正式 ERP 或產生扣款");
        }}
      />
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function StoreDemo({ view, setView, cartCount, openCart, addItem }: {
  view: StoreView;
  setView: (view: StoreView) => void;
  cartCount: number;
  openCart: () => void;
  addItem: (item: typeof apparel[number]) => void;
}) {
  return (
    <div className="store-shell">
      <nav className="store-nav">
        <button className="store-brand" onClick={() => setView("home")}>ATELIER NOIR<small>Quiet forms, made to live in.</small></button>
        <div>
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>首頁與商品</button>
          <button onClick={() => document.getElementById("campaign")?.scrollIntoView({ behavior: "smooth" })}>最新活動</button>
          <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>訂單查詢</button>
          <button className={view === "member" ? "active" : ""} onClick={() => setView("member")}>會員中心</button>
        </div>
        <button className="bag-button" onClick={openCart}>購物袋 <b>{cartCount}</b></button>
      </nav>

      {view === "home" && (
        <>
          <section className="store-hero">
            <div className="hero-copy">
              <span className="eyebrow">SPRING / SUMMER 2026</span>
              <h1>少一點喧嘩，<br />多一點長久。</h1>
              <p>以自然材質、安靜輪廓與可重複穿著的設計，組成你的日常衣櫥。</p>
              <button onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}>探索本週選品 <span>→</span></button>
              <div className="sync-note"><i />網站、門市 POS 與 ERP 共用即時庫存</div>
            </div>
            <div className="hero-photo">
              <img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=86" alt="服飾店內陳列" fetchPriority="high" />
              <div><small>NEW DROP 06</small><strong>輕量剪裁系列</strong><span>12 款 ・ 全店庫存同步</span></div>
            </div>
          </section>
          <section className="trust-row">
            <div><b>01</b><span><strong>全館滿額免運</strong>NT$2,000 即享宅配免運</span></div>
            <div><b>02</b><span><strong>門市快速取貨</strong>最快 2 小時完成備貨</span></div>
            <div><b>03</b><span><strong>安心多元付款</strong>信用卡・行動支付・轉帳</span></div>
            <div><b>04</b><span><strong>跨通路會員</strong>點數與消費紀錄自動合併</span></div>
          </section>
          <section className="products-section" id="products">
            <div className="section-title"><span>CURATED NOW</span><h2>本週選品</h2><p>庫存更新於剛剛 ・ 共 61 件可售</p></div>
            <div className="product-grid">
              {apparel.map((item) => (
                <article className="product-card" key={item.id}>
                  <div className="product-photo">
                    {item.badge && <span>{item.badge}</span>}
                    <img src={item.image} alt={item.name} loading="lazy" />
                    <button onClick={() => addItem(item)}>快速加入購物車 ＋</button>
                  </div>
                  <small>{item.id} ・ 現貨 {item.stock}</small>
                  <h3>{item.name}</h3>
                  <div><b>{formatMoney(item.price)}</b><span>{item.meta}</span></div>
                </article>
              ))}
            </div>
          </section>
          <section className="campaign" id="campaign">
            <img src="https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=82" alt="極簡服飾穿搭企劃" loading="lazy" />
            <div><span>07.23—08.16</span><h2>THE SOFT<br />STRUCTURE</h2><p>任選兩件 9 折，會員再享 2% 點數回饋。</p><button onClick={() => addItem(apparel[0])}>加入活動商品 →</button></div>
          </section>
        </>
      )}
      {view === "member" && <MemberPanel setView={setView} />}
      {view === "orders" && <OrdersPanel />}
      <footer className="store-footer"><strong>ATELIER NOIR</strong><p>品牌網站・購物車・付款介面・會員與訂單查詢。正式電商租戶會連回自己的 ERP。</p><span>Demo tenant: atelier-noir.shop.demo</span></footer>
    </div>
  );
}

function MemberPanel({ setView }: { setView: (view: StoreView) => void }) {
  return (
    <main className="member-page">
      <div className="member-hero"><div className="avatar">王</div><div><span>WELCOME BACK</span><h1>王小美，午安</h1><p>NOIR MEMBER ・ 加入於 2026/03/12</p></div><button>編輯會員資料</button></div>
      <div className="member-stats"><article><span>可用點數</span><strong>1,280</strong><small>100 點可折 NT$100</small></article><article><span>會員等級</span><strong>SILVER</strong><small>再消費 NT$3,600 升等</small></article><article><span>有效優惠券</span><strong>3</strong><small>最近到期：08/16</small></article><article><span>累積訂單</span><strong>9</strong><small>線上與門市合併</small></article></div>
      <div className="member-bottom"><article><h2>快速入口</h2><button onClick={() => setView("orders")}><b>訂單查詢</b><span>查看出貨與取貨進度</span>→</button><button><b>我的優惠券</b><span>3 張可使用</span>→</button><button><b>收藏清單</b><span>已收藏 5 件商品</span>→</button></article><article><h2>會員專屬</h2><div className="progress-copy"><span>本年度累積</span><b>NT$8,400 / NT$12,000</b></div><div className="progress"><i /></div><p>消費與點數會合併門市 POS 紀錄，跨通路仍是同一位顧客。</p></article></div>
    </main>
  );
}

function OrdersPanel() {
  const [query, setQuery] = useState("");
  const orders = [
    { id: "EC2607231842", date: "2026/07/23 12:18", status: "已付款・待出貨", total: 3960, steps: 2 },
    { id: "EC2607181042", date: "2026/07/18 16:30", status: "配送中", total: 3960, steps: 3 },
    { id: "EC2607010821", date: "2026/07/01 12:12", status: "已完成", total: 2680, steps: 4 },
  ].filter((order) => !query || order.id.toLowerCase().includes(query.toLowerCase()));
  return (
    <main className="orders-page">
      <div className="page-heading"><span>TRACK YOUR ORDER</span><h1>訂單查詢</h1><p>網站訂單、門市取貨與 POS 交易集中在同一個會員中心。</p></div>
      <label className="order-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入訂單編號，例如 EC2607231842" /></label>
      <div className="order-list">{orders.map((order) => <article key={order.id}><header><div><b>{order.id}</b><span>{order.date}</span></div><strong>{order.status}</strong></header><div className="order-main"><span>2 件商品・王小美</span><b>{formatMoney(order.total)}</b><button>查看明細 →</button></div><div className="order-progress">{["訂單成立","付款完成","理貨出貨","已送達"].map((step, index) => <span key={step} className={index < order.steps ? "done" : ""}><i />{step}</span>)}</div></article>)}</div>
    </main>
  );
}

function CartDrawer({ open, close, lines, total, update, checkout }: {
  open: boolean;
  close: () => void;
  lines: CartLine[];
  total: number;
  update: (id: string, delta: number) => void;
  checkout: () => void;
}) {
  return (
    <>
      <button className={`drawer-backdrop ${open ? "show" : ""}`} onClick={close} aria-label="關閉購物車" />
      <aside className={`cart-drawer ${open ? "show" : ""}`}>
        <header><div><span>YOUR BAG</span><h2>購物車・{lines.reduce((sum, line) => sum + line.qty, 0)} 件</h2></div><button onClick={close}>×</button></header>
        <div className="drawer-lines">{lines.length === 0 ? <div className="drawer-empty"><span>◇</span><h3>購物車還是空的</h3><p>先從本週選品找到適合你的日常單品。</p></div> : lines.map((line) => <article key={line.id}><img src={line.image} alt={line.name} /><div><small>{line.id}</small><h3>{line.name}</h3><p>{line.meta}</p><span><button onClick={() => update(line.id,-1)}>−</button><b>{line.qty}</b><button onClick={() => update(line.id,1)}>＋</button></span></div><strong>{formatMoney(line.price * line.qty)}</strong></article>)}</div>
        {lines.length > 0 && <footer><div><span>商品小計</span><strong>{formatMoney(total)}</strong></div><p>{total >= 2000 ? "已達免運門檻" : `還差 ${formatMoney(2000-total)} 即享免運`}</p><button onClick={checkout}>試用安心結帳 →</button><small>試用模式不會產生真實扣款</small></footer>}
      </aside>
    </>
  );
}
