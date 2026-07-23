"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

type Mode = "commerce" | "erp" | "retail" | "restaurant";
type Line = { id: string; name: string; price: number; image: string; qty: number; meta?: string };
type WebOrder = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  customer: string;
  channel: string;
  lines: Line[];
};

const retailProducts = [
  { id: "RTL-101", name: "純棉購物袋", price: 180, stock: 50, category: "熱銷推薦", image: "/images/products/cotton-tote.webp" },
  { id: "RTL-202", name: "不鏽鋼保溫杯", price: 490, stock: 36, category: "熱銷推薦", image: "/images/products/vacuum-bottle.webp" },
  { id: "RTL-303", name: "木質調香氛蠟燭", price: 360, stock: 28, category: "香氛保養", image: "/images/products/scented-candle.webp" },
  { id: "RTL-404", name: "極簡皮革卡夾", price: 680, stock: 17, category: "服飾配件", image: "/images/products/leather-card-holder.webp" },
  { id: "RTL-505", name: "植萃護手霜", price: 320, stock: 41, category: "香氛保養", image: "/images/products/hand-cream.webp" },
  { id: "RTL-606", name: "亞麻室內拖鞋", price: 560, stock: 22, category: "生活選物", image: "/images/products/linen-slippers.webp" },
  { id: "RTL-707", name: "霧面陶瓷馬克杯", price: 420, stock: 34, category: "生活選物", image: "/images/products/ceramic-mug.webp" },
  { id: "RTL-808", name: "棉麻日常圍裙", price: 780, stock: 19, category: "服飾配件", image: "/images/products/linen-apron.webp" },
  { id: "RTL-909", name: "旅行收納袋組", price: 590, stock: 26, category: "生活選物", image: "/images/products/travel-organizer.webp" },
  { id: "RTL-110", name: "北歐針織抱枕", price: 890, stock: 15, category: "生活選物", image: "/images/products/knit-cushion.webp" },
  { id: "RTL-120", name: "天然精油滾珠瓶", price: 460, stock: 31, category: "香氛保養", image: "/images/products/essential-oil.webp" },
  { id: "RTL-130", name: "不鏽鋼餐具組", price: 520, stock: 29, category: "熱銷推薦", image: "/images/products/cutlery-set.webp" },
];

const dishes = [
  { id: "F001", name: "經典牛肉漢堡", price: 220, meta: "主餐・現做", category: "主餐", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80" },
  { id: "F002", name: "香蒜奶油義大利麵", price: 190, meta: "主餐・15 分", category: "主餐", image: "https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=500&q=80" },
  { id: "F003", name: "松露脆薯", price: 120, meta: "小點・炸台", category: "小點", image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80" },
  { id: "D001", name: "拿鐵咖啡", price: 110, meta: "飲品・熱／冰", category: "飲品甜點", image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=500&q=80" },
  { id: "D002", name: "季節水果茶", price: 100, meta: "飲品・冰", category: "飲品甜點", image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80" },
  { id: "D003", name: "焦糖乳酪蛋糕", price: 130, meta: "甜點・冷藏", category: "飲品甜點", image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80" },
  { id: "F004", name: "香煎雞腿排", price: 260, meta: "主餐・鐵板", category: "主餐", image: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=500&q=80" },
  { id: "F005", name: "奶油鮭魚燉飯", price: 280, meta: "主餐・18 分", category: "主餐", image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=500&q=80" },
  { id: "F006", name: "和風鮮蔬沙拉", price: 150, meta: "小點・冷台", category: "小點", image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=500&q=80" },
  { id: "F007", name: "主廚玉米濃湯", price: 90, meta: "小點・湯台", category: "小點", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=500&q=80" },
  { id: "D004", name: "經典提拉米蘇", price: 160, meta: "甜點・冷藏", category: "飲品甜點", image: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=500&q=80" },
  { id: "D005", name: "柚香氣泡飲", price: 120, meta: "飲品・冰", category: "飲品甜點", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=500&q=80" },
];
const money = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
}).format(value);

export function TenantExperienceClient({ managerName }: { managerName: string }) {
  const [mode, setMode] = useState<Mode>("commerce");
  const [webOrders, setWebOrders] = useState<WebOrder[]>([]);
  const [notice, setNotice] = useState("管理者體驗已載入；消費者商城不會顯示此入口。");

  function refreshOrders() {
    try {
      const saved = window.localStorage.getItem("erin-commerce-demo-orders");
      setWebOrders(saved ? JSON.parse(saved) : []);
      setNotice(saved ? "已同步本裝置最新商城訂單。" : "尚無新商城訂單，請先以消費者身分完成結帳。");
    } catch {
      setNotice("無法讀取本裝置示範訂單。");
    }
  }

  useEffect(() => {
    refreshOrders();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "erin-commerce-demo-orders") refreshOrders();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="manager-demo">
      <header className="topbar">
        <button className="logo" onClick={() => setMode("commerce")}>
          <span>ERIN</span>
          <small>TENANT EXPERIENCE</small>
        </button>
        <nav className="mode-switch" aria-label="選擇示範模式">
          {([
            ["commerce", "商城 ERP"],
            ["erp", "一般 ERP"],
            ["retail", "零售 POS"],
            ["restaurant", "餐飲 POS"],
          ] as Array<[Mode, string]>).map(([value, label], index) => (
            <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>
              <span>0{index + 1}</span>{label}
            </button>
          ))}
        </nav>
        <div className="tenant-pill"><i />{managerName}・租戶管理者</div>
      </header>
      <div className="manager-account-context">
        <b>登入身分：租戶管理者</b>
        <span>正式租戶須先註冊或由平台授權；商城消費者會員無法進入此頁。</span>
        <div className="manager-account-actions"><em>Sites 僅線上體驗，不直接提供安裝檔</em><a href="https://erp-inventory-management-copy.vercel.app/register?mode=ECOMMERCE" target="_blank" rel="noreferrer">正式租戶註冊 ↗</a><a href="https://erp-inventory-management-copy.vercel.app/downloads" target="_blank" rel="noreferrer">主 APP 授權下載 ↗</a></div>
      </div>

      {mode === "commerce" && <ErpDemo commerce orders={webOrders} notice={notice} refresh={refreshOrders} />}
      {mode === "erp" && <ErpDemo orders={webOrders} notice={notice} refresh={refreshOrders} />}
      {mode === "retail" && <RetailPosDemo notify={setNotice} />}
      {mode === "restaurant" && <RestaurantPosDemo notify={setNotice} />}
      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </div>
  );
}

function ErpDemo({ commerce = false, orders, notice, refresh }: {
  commerce?: boolean;
  orders: WebOrder[];
  notice: string;
  refresh: () => void;
}) {
  const rows = commerce
    ? [
        ...orders.map((order) => ({ id: order.id, customer: order.customer, channel: order.channel, status: order.status, total: order.total })),
        { id: "EC2607231842", customer: "王小美", channel: "品牌官網", status: "待出貨", total: 3960 },
        { id: "EC2607221028", customer: "林子晴", channel: "門市取貨", status: "備貨中", total: 2680 },
      ]
    : [
        { id: "SO2607230061", customer: "沐光設計有限公司", channel: "業務建立", status: "已核准", total: 86200 },
        { id: "SO2607230058", customer: "海岸生活商行", channel: "報價轉單", status: "待出貨", total: 32600 },
        { id: "SO2607220142", customer: "方格空間工作室", channel: "業務建立", status: "已完成", total: 18500 },
      ];
  return (
    <main className="erp-page">
      <aside className="erp-sidebar">
        <div className="erp-brand"><span>E</span><div><b>{commerce ? "電商 ERP" : "ERIN ERP"}</b><small>{commerce ? "COMMERCE EDITION" : "BUSINESS EDITION"}</small></div></div>
        <nav>
          {["營運總覽","商品管理","庫存管理","銷售訂單","採購管理","客戶 CRM","出貨管理","優惠券","報表分析","會計傳票","系統設定"].map((item, index) => <button className={item === "銷售訂單" ? "active" : ""} key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}{item === "銷售訂單" && commerce ? <b>{Math.max(1, orders.length)}</b> : null}</button>)}
        </nav>
        <div className="erp-user"><span>管</span><div><b>租戶管理者</b><small>系統管理員・完整權限</small></div></div>
      </aside>
      <section className="erp-content">
        <header>
          <div><span>{commerce ? "ECOMMERCE / WEB ORDERS" : "ERP / OPERATIONS"}</span><h1>{commerce ? "商城與 ERP 連動中心" : "企業營運總覽"}</h1></div>
          <div>{commerce ? <a className="live-admin-link" href="/?managerPreview=1" target="_blank">一般消費者官網 ↗</a> : null}<button onClick={refresh}>重新同步</button><button className="primary">＋ 建立訂單</button></div>
        </header>
        <div className="erp-alert"><i />{notice}<button onClick={refresh}>立即更新</button></div>
        <div className="kpi-grid">
          <article className="kpi"><span>今日營業額</span><strong>{commerce ? "NT$ 68,420" : "NT$ 137,300"}</strong><div><b>↑ 12.8%</b><small>較昨日</small></div></article>
          <article className="kpi"><span>{commerce ? "待處理網路訂單" : "待出貨訂單"}</span><strong>{commerce ? Math.max(3, orders.length + 2) : 7}</strong><div><b className="warn">需處理</b><small>即時更新</small></div></article>
          <article className="kpi"><span>低庫存商品</span><strong>4</strong><div><b className="warn">需補貨</b><small>已保留網路訂單</small></div></article>
          <article className="kpi"><span>{commerce ? "本月新會員" : "本月新客戶"}</span><strong>{commerce ? 128 : 16}</strong><div><b>↑ 8.4%</b><small>自動合併 CRM</small></div></article>
        </div>
        <div className="erp-grid">
          <article className="orders-card">
            <div className="card-title"><div><h2>{commerce ? "最新網路訂單" : "最新銷售訂單"}</h2><p>{commerce ? "消費者送單後自動進入目前租戶" : "訂單、出貨與應收進度"}</p></div><div><button className="active">全部</button><button>待處理</button><button>已完成</button></div></div>
            <table><thead><tr><th>訂單編號</th><th>客戶</th><th>來源</th><th>狀態</th><th>金額</th><th /></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><b>{order.id}</b></td><td>{order.customer}</td><td><span className="channel">{order.channel}</span></td><td><span className="status">{order.status}</span></td><td>{money(order.total)}</td><td><button>處理 →</button></td></tr>)}</tbody></table>
          </article>
          <article className="inventory-card">
            <div className="card-title"><div><h2>庫存與保留量</h2><p>網路訂單先保留，出貨才扣實體庫存</p></div></div>
            {[["雲感落肩襯衫",18,72],["輪廓打褶寬褲",7,28],["方形皮革肩背包",12,48],["亞麻混紡長洋裝",9,36]].map(([name, stock, width]) => <div className="stock-item" key={String(name)}><span>{String(name).slice(0,1)}</span><div><b>{name}</b><small>可售 {stock}・安全量 5</small><i><em style={{ width: `${width}%` }} /></i></div><strong>{stock}</strong></div>)}
            <button className="restock">建立補貨建議</button>
          </article>
        </div>
      </section>
    </main>
  );
}

function RetailPosDemo({ notify }: { notify: (message: string) => void }) {
  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState("散客");
  const [retailCategory, setRetailCategory] = useState("全部商品");
  const visibleRetailProducts = retailCategory === "全部商品" ? retailProducts : retailProducts.filter((product) => product.category === retailCategory);
  const total = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.qty, 0), [cart]);
  const add = (product: typeof retailProducts[number]) => {
    notify(`${product.name} 已加入交易`);
    setCart((current) => {
      const found = current.find((line) => line.id === product.id);
      return found ? current.map((line) => line.id === product.id ? { ...line, qty: line.qty + 1 } : line) : [...current, { ...product, qty: 1 }];
    });
  };
  return (
    <main className="pos-page">
      <div className="module-heading"><div><span>RETAIL POS / REGISTER 01</span><h1>快速收銀</h1><p>大按鈕、即時回饋與單頁結帳，尖峰時段不切頁。</p></div><div className="heading-actions"><button onClick={() => setCustomer(customer === "散客" ? "王小美・金卡" : "散客")}>會員：{customer}</button><button className="user-chip">收銀員 林小姐</button></div></div>
      <div className="retail-pos-layout">
        <section className="retail-tools">
          <label className="pos-search">⌕<input placeholder="掃描條碼或搜尋商品" /></label>
          <div className="retail-shift"><span>本班營業額</span><strong>NT$ 18,640</strong><small><i />收銀台連線正常</small></div>
          {["全部商品","熱銷推薦","生活選物","香氛保養","服飾配件"].map((item) => <button onClick={() => setRetailCategory(item)} className={retailCategory === item ? "active" : ""} key={item}>{item}<span>{item === "全部商品" ? retailProducts.length : retailProducts.filter((product) => product.category === item).length}</span></button>)}
          <button onClick={() => notify("已開啟暫存訂單清單")}>暫存訂單 <span>2</span></button>
          <button onClick={() => notify("已開啟退換貨查詢")}>退換貨查詢</button>
        </section>
        <section className="menu-panel">
          <div className="category-row"><button className={retailCategory === "全部商品" ? "active" : ""} onClick={() => setRetailCategory("全部商品")}>全部 {retailProducts.length}</button><button className={retailCategory === "熱銷推薦" ? "active" : ""} onClick={() => setRetailCategory("熱銷推薦")}>本店熱銷</button><button className={retailCategory === "生活選物" ? "active" : ""} onClick={() => setRetailCategory("生活選物")}>生活選物</button></div>
          <div className="dish-grid">{visibleRetailProducts.map((product) => <button key={product.id} onClick={() => add(product)}><img src={product.image} alt={product.name} /><span><b>{product.name}</b><small>{product.id}・現貨 {product.stock}</small><strong>{money(product.price)}</strong></span><i>＋</i></button>)}</div>
        </section>
        <OrderPanel title="目前交易" subtitle={`會員：${customer}`} lines={cart} total={total} setLines={setCart} primaryLabel="前往結帳" pay={() => { if (!cart.length) return; setCart([]); notify(`交易完成 ${money(total)}・庫存與 ERP 已同步`); }} />
      </div>
    </main>
  );
}

function RestaurantPosDemo({ notify }: { notify: (message: string) => void }) {
  const [table, setTable] = useState("T03");
  const [lines, setLines] = useState<Line[]>([]);
  const [sent, setSent] = useState(false);
  const [dishCategory, setDishCategory] = useState("全部");
  const visibleDishes = dishCategory === "全部" ? dishes : dishes.filter((dish) => dish.category === dishCategory);
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.price * line.qty, 0), [lines]);
  const add = (dish: typeof dishes[number]) => {
    setLines((current) => {
      const found = current.find((line) => line.id === dish.id);
      return found ? current.map((line) => line.id === dish.id ? { ...line, qty: line.qty + 1 } : line) : [...current, { ...dish, qty: 1 }];
    });
    setSent(false);
    notify(`${dish.name} 已加入 ${table}`);
  };
  return (
    <main className="pos-page">
      <div className="module-heading"><div><span>RESTAURANT POS / FRONT</span><h1>桌位、點餐與廚房同步</h1><p>顏色辨識桌況，一個畫面完成開桌、加點、送廚與結帳。</p></div><div className="heading-actions"><button onClick={() => notify("廚房看板：3 張製作中、1 張待出餐")}>廚房看板 <b>4</b></button><button className="user-chip">外場 林小姐</button></div></div>
      <div className="pos-layout">
        <section className="tables-panel">
          <div className="panel-label"><b>用餐區</b><span><i />6 / 12 使用中</span></div>
          <small>點選桌位立即切換訂單</small>
          <div className="tables-grid">{["T01","T02","T03","T04","T05","T06","T07","T08"].map((id, index) => <button key={id} className={`${index < 5 ? "occupied" : ""} ${table === id ? "selected" : ""}`} onClick={() => { setTable(id); setLines([]); setSent(false); notify(`已切換到 ${id}`); }}><b>{id}</b><span>{index < 5 ? index === 2 ? "待送廚" : "用餐中" : "空桌"}</span><small>{index < 5 ? `${2 + index % 3} 位・${12 + index * 3} 分` : "可開桌"}</small></button>)}</div>
          <button className="manage-button" onClick={() => notify("桌位配置已開啟")}>管理桌位與併桌</button>
        </section>
        <section className="menu-panel">
          <label className="pos-search">⌕<input placeholder="搜尋餐點或掃描條碼" /></label>
          <div className="category-row">{["全部","主餐","小點","飲品甜點"].map((item) => <button key={item} className={dishCategory === item ? "active" : ""} onClick={() => setDishCategory(item)}>{item}{item === "全部" ? ` ${dishes.length}` : ""}</button>)}</div>
          <div className="dish-grid">{visibleDishes.map((dish) => <button key={dish.id} onClick={() => add(dish)}><img src={dish.image} alt={dish.name} /><span><b>{dish.name}</b><small>{dish.meta}</small><strong>{money(dish.price)}</strong></span><i>＋</i></button>)}</div>
        </section>
        <OrderPanel title={`${table}・內用`} subtitle={sent ? "已送廚・可繼續加點" : "尚未送廚"} lines={lines} total={total} setLines={setLines} primaryLabel={sent ? "桌位結帳" : "送出廚房單"} pay={() => { if (!lines.length) return; if (!sent) { setSent(true); notify(`${table} 已送廚，廚房看板即時收到`); } else { setLines([]); setSent(false); notify(`${table} 結帳完成，桌位已釋放`); } }} />
      </div>
    </main>
  );
}

function OrderPanel({ title, subtitle, lines, total, setLines, primaryLabel, pay }: {
  title: string;
  subtitle: string;
  lines: Line[];
  total: number;
  setLines: Dispatch<SetStateAction<Line[]>>;
  primaryLabel: string;
  pay: () => void;
}) {
  function update(id: string, delta: number) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, qty: line.qty + delta } : line).filter((line) => line.qty > 0));
  }
  return (
    <aside className="order-panel">
      <header><div><span>{subtitle}</span><h2>{title}</h2></div><b>{lines.reduce((sum, line) => sum + line.qty, 0)} 項</b></header>
      <div className="order-items">{!lines.length ? <div className="order-empty"><span>＋</span><b>點選商品開始操作</b><small>商品會立即加入右側，無須切換頁面。</small></div> : lines.map((line) => <article key={line.id}><img src={line.image} alt={line.name} /><div><b>{line.name}</b><small>{line.meta || line.id}</small><span><button onClick={() => update(line.id,-1)}>−</button><strong>{line.qty}</strong><button onClick={() => update(line.id,1)}>＋</button></span></div><strong>{money(line.price * line.qty)}</strong></article>)}</div>
      <footer><div><span>應收總額</span><strong>{money(total)}</strong></div><button disabled={!lines.length} onClick={pay}>{primaryLabel}<span>現金・刷卡・行動支付</span></button></footer>
    </aside>
  );
}
