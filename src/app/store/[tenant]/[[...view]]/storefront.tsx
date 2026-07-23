"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Box,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  CreditCard,
  Gift,
  Heart,
  House,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TicketPercent,
  Trash2,
  Truck,
  WalletCards,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import styles from "./storefront.module.css";

type Product = {
  id: string;
  sku?: string;
  name: string;
  category: string;
  price: number;
  compareAt?: number;
  colors: string[];
  sizes: string[];
  stock: number;
  badge?: string;
  image: string;
};

type CartLine = {
  productId: string;
  quantity: number;
  size: string;
  color: string;
};

type Order = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  items: number;
  recipient: string;
};

type ViewName = "home" | "products" | "campaigns" | "cart" | "checkout" | "member" | "orders";
type AddToCart = (product: Product, options?: { size?: string; color?: string; open?: boolean }) => void;

const PRODUCTS: Product[] = [
  {
    id: "AN-SS26-101",
    name: "雲感落肩襯衫",
    category: "上身",
    price: 1680,
    compareAt: 1980,
    colors: ["霧白", "礦灰"],
    sizes: ["S", "M", "L"],
    stock: 18,
    badge: "本週新品",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "AN-SS26-204",
    name: "輪廓打褶寬褲",
    category: "下身",
    price: 2280,
    colors: ["岩黑", "沙褐"],
    sizes: ["S", "M", "L", "XL"],
    stock: 7,
    badge: "低庫存",
    image: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "AN-SS26-306",
    name: "日常織紋針織衫",
    category: "針織",
    price: 1880,
    colors: ["燕麥", "鼠尾草"],
    sizes: ["F"],
    stock: 24,
    image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "AN-SS26-408",
    name: "方形皮革肩背包",
    category: "配件",
    price: 2680,
    colors: ["可可", "夜黑"],
    sizes: ["F"],
    stock: 12,
    badge: "人氣補貨",
    image: "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "AN-SS26-512",
    name: "亞麻混紡長洋裝",
    category: "洋裝",
    price: 2980,
    compareAt: 3380,
    colors: ["砂岩", "墨綠"],
    sizes: ["S", "M", "L"],
    stock: 9,
    badge: "官網限定",
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "AN-SS26-614",
    name: "極簡皮革休閒鞋",
    category: "鞋履",
    price: 3280,
    colors: ["奶油白", "霧黑"],
    sizes: ["36", "37", "38", "39", "40"],
    stock: 15,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82",
  },
];

const VALID_VIEWS = new Set<ViewName>(["home", "products", "campaigns", "cart", "checkout", "member", "orders"]);

const money = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
}).format(value);

function tenantTheme(tenant: string) {
  if (tenant === "moon-form") {
    return {
      brand: "MOON FORM",
      note: "日常服裝研究室",
      accent: "#315f65",
      domain: "moon-form.shop.demo",
    };
  }
  return {
    brand: "ATELIER NOIR",
    note: "Quiet forms, made to live in.",
    accent: "#9a4f34",
    domain: "atelier-noir.shop.demo",
  };
}

export function FashionStorefront({ tenant, initialView, initialStoreName, managerAccess = false, managerBackHref = "/products", managerErpHref = "/dashboard" }: { tenant: string; initialView: string; initialStoreName?: string; managerAccess?: boolean; managerBackHref?: string; managerErpHref?: string }) {
  const router = useRouter();
  const [theme, setTheme] = useState(() => ({ ...tenantTheme(tenant), ...(initialStoreName ? { brand: initialStoreName } : {}) }));
  const view = VALID_VIEWS.has(initialView as ViewName) ? initialView as ViewName : "home";
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [storeLive, setStoreLive] = useState(false);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [syncMessage, setSyncMessage] = useState("展示商店・未連接正式 ERP");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTheme({ ...tenantTheme(tenant), ...(initialStoreName ? { brand: initialStoreName } : {}) });
    try {
      const savedCart = window.localStorage.getItem(`fashion-cart:${tenant}`);
      const savedOrders = window.localStorage.getItem(`fashion-orders:${tenant}`);
      if (savedCart) setCart(JSON.parse(savedCart));
      if (savedOrders) setOrders(JSON.parse(savedOrders));
    } catch {}
    setHydrated(true);
  }, [initialStoreName, tenant]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(`fashion-cart:${tenant}`, JSON.stringify(cart));
  }, [cart, hydrated, tenant]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/store/${encodeURIComponent(tenant)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "尚未連接正式 ERP");
        const liveProducts = (result.products ?? []).map((product: any): Product => ({
          id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category || "商品",
          price: Number(product.price),
          colors: ["依商品規格"],
          sizes: product.spec ? [product.spec] : ["F"],
          stock: Number(product.stock),
          badge: Number(product.stock) < 10 ? "低庫存" : undefined,
          image: product.image || "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=900&q=82",
        }));
        setProducts(liveProducts);
        setStoreLive(true);
        setAcceptingOrders(Boolean(result.acceptingOrders));
        setTheme((current) => ({
          ...current,
          brand: result.store?.name || result.tenant.name || current.brand,
          domain: result.store?.url || current.domain,
        }));
        setSyncMessage(result.acceptingOrders ? `${result.tenant.name}・ERP 即時同步` : result.accessMessage || "商城目前暫停接單");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProducts(PRODUCTS);
        setStoreLive(false);
        setAcceptingOrders(true);
        setSyncMessage("展示商店・不會寫入正式 ERP");
      });
    return () => controller.abort();
  }, [tenant]);

  const detailedCart = useMemo(() => cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ ...line, product }] : [];
  }), [cart, products]);
  const cartQuantity = detailedCart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = detailedCart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  function addToCart(product: Product, options?: { size?: string; color?: string; open?: boolean }) {
    const size = options?.size || product.sizes[0];
    const color = options?.color || product.colors[0];
    setCart((current) => {
      const match = current.find((line) => line.productId === product.id && line.size === size && line.color === color);
      if (match) {
        return current.map((line) => line === match ? { ...line, quantity: Math.min(product.stock, line.quantity + 1) } : line);
      }
      return [...current, { productId: product.id, quantity: 1, size, color }];
    });
    if (options?.open !== false) setCartOpen(true);
  }

  function updateLine(target: CartLine, quantity: number) {
    setCart((current) => quantity <= 0
      ? current.filter((line) => line !== target)
      : current.map((line) => line === target ? { ...line, quantity } : line));
  }

  function saveOrder(order: Order) {
    const next = [order, ...orders];
    setOrders(next);
    window.localStorage.setItem(`fashion-orders:${tenant}`, JSON.stringify(next));
    setCart([]);
  }

  return (
    <div className={styles.shell} style={{ "--store-accent": theme.accent } as React.CSSProperties}>
      {managerAccess && (
        <aside className={styles.managerPreviewDock} aria-label="管理者商城預覽">
          <div><ShieldCheck size={18} /><span><strong>租戶管理者預覽</strong><small>消費者不會看到此控制列</small></span></div>
          <div className={styles.managerPreviewActions}>
            <Link href={managerBackHref}><ArrowLeft size={16} />{managerBackHref === "/admin" ? "回平台管理" : "回到電商後台"}</Link>
            <Link href={managerErpHref}><BarChart3 size={16} />切換 ERP</Link>
          </div>
        </aside>
      )}
      <div className={styles.utilityBar}>
        <div><Zap size={14} /> 店取最快 2 小時 ・ 全館滿 NT$2,000 免運</div>
        <div className={styles.tenantStatus}><span /> {storeLive ? "品牌商城" : "功能展示"} ・ {syncMessage}</div>
      </div>

      <header className={styles.header}>
        <Link href={`/store/${tenant}`} className={styles.brand} aria-label={`${theme.brand} 首頁`}>
          <span>{theme.brand}</span>
          <small>{theme.note}</small>
        </Link>
        <nav className={styles.desktopNav} aria-label="商城主選單">
          <StoreLink tenant={tenant} view="home" active={view === "home"}>首頁</StoreLink>
          <StoreLink tenant={tenant} view="products" active={view === "products"}>商品介紹</StoreLink>
          <StoreLink tenant={tenant} view="campaigns" active={view === "campaigns"}>最新活動</StoreLink>
          <StoreLink tenant={tenant} view="orders" active={view === "orders"}>訂單查詢</StoreLink>
        </nav>
        <div className={styles.headerActions}>
          <Link href={`/store/${tenant}/products`} aria-label="搜尋商品"><Search size={20} /></Link>
          <Link href={`/store/${tenant}/member`} aria-label="會員中心"><CircleUserRound size={20} /></Link>
          <button onClick={() => setCartOpen(true)} aria-label={`購物車，共 ${cartQuantity} 件`}>
            <ShoppingBag size={20} />
            {cartQuantity > 0 && <span className={styles.cartCount}>{cartQuantity}</span>}
          </button>
        </div>
      </header>

      <main>
        {view === "home" && <HomeView tenant={tenant} products={products} addToCart={addToCart} />}
        {view === "products" && <ProductsView products={products} addToCart={addToCart} />}
        {view === "campaigns" && <CampaignsView tenant={tenant} products={products} addToCart={addToCart} />}
        {view === "cart" && <CartView tenant={tenant} lines={detailedCart} subtotal={subtotal} updateLine={updateLine} />}
        {view === "checkout" && <CheckoutView tenant={tenant} lines={detailedCart} subtotal={subtotal} saveOrder={saveOrder} storeLive={storeLive} acceptingOrders={acceptingOrders} />}
        {view === "member" && <MemberView tenant={tenant} orderCount={orders.length} />}
        {view === "orders" && <OrdersView orders={orders} />}
      </main>

      <footer className={styles.footer}>
        <div>
          <div className={styles.footerBrand}>{theme.brand}</div>
          <p>讓品牌前台、門市 POS 與 ERP 後台使用同一份商品、庫存、會員與訂單資料。</p>
        </div>
        <div><strong>顧客服務</strong><Link href={`/store/${tenant}/orders`}>訂單查詢</Link><Link href={`/store/${tenant}/member`}>會員中心</Link><a href="mailto:service@example.com">聯絡客服</a></div>
        <div><strong>購物指南</strong><span>付款與配送說明</span><span>退換貨政策</span><span>隱私權政策</span></div>
        <div className={styles.syncCard}><Warehouse size={22} /><strong>即時庫存</strong><span>最後同步：剛剛</span><span>{products.length} 項商品 ・ {products.reduce((sum, product) => sum + product.stock, 0)} 件可售</span></div>
      </footer>

      <div className={styles.mobileNav}>
        <StoreLink tenant={tenant} view="home" active={view === "home"} icon={<House size={19} />}>首頁</StoreLink>
        <StoreLink tenant={tenant} view="products" active={view === "products"} icon={<Shirt size={19} />}>商品</StoreLink>
        <button onClick={() => setCartOpen(true)} className={cartOpen ? styles.activeMobile : ""}><ShoppingCart size={19} /><span>購物車</span>{cartQuantity > 0 && <b>{cartQuantity}</b>}</button>
        <StoreLink tenant={tenant} view="member" active={view === "member"} icon={<CircleUserRound size={19} />}>會員</StoreLink>
      </div>

      <CartDrawer
        open={cartOpen}
        close={() => setCartOpen(false)}
        tenant={tenant}
        lines={detailedCart}
        subtotal={subtotal}
        updateLine={updateLine}
      />
    </div>
  );
}

function StoreLink({ tenant, view, active, children, icon }: {
  tenant: string;
  view: ViewName;
  active: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const href = view === "home" ? `/store/${tenant}` : `/store/${tenant}/${view}`;
  return <Link href={href} className={active ? styles.activeLink : ""}>{icon}{children}</Link>;
}

function HomeView({ tenant, products, addToCart }: { tenant: string; products: Product[]; addToCart: AddToCart }) {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>SPRING / SUMMER 2026</span>
          <h1>少一點喧嘩，<br />多一點長久。</h1>
          <p>以自然材質、安靜輪廓與可重複穿著的設計，組成你的日常衣櫥。</p>
          <div className={styles.heroActions}>
            <Link href={`/store/${tenant}/products`} className={styles.primaryButton}>探索新作 <ArrowRight size={17} /></Link>
            <Link href={`/store/${tenant}/campaigns`} className={styles.textButton}>本月企劃 <ChevronRight size={16} /></Link>
          </div>
          <div className={styles.heroProof}><span>01</span><p>線上選購</p><span>02</span><p>門市取貨</p><span>03</span><p>ERP 即時保留</p></div>
        </div>
        <div className={styles.heroVisual}>
          <img
            src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=86"
            alt="服飾店內陳列與選品"
            fetchPriority="high"
          />
          <div className={styles.heroFloat}>
            <span>NEW DROP 06</span>
            <strong>輕量剪裁系列</strong>
            <small>共 12 款 ・ 全店庫存同步</small>
          </div>
        </div>
      </section>

      <section className={styles.assuranceStrip}>
        <div><Truck /><span><strong>全館滿額免運</strong>NT$2,000 即享宅配免運</span></div>
        <div><PackageCheck /><span><strong>門市快速取貨</strong>庫存確認後最快 2 小時</span></div>
        <div><ShieldCheck /><span><strong>安心付款</strong>信用卡、行動支付與轉帳</span></div>
        <div><BadgeCheck /><span><strong>會員累積</strong>線上線下點數共用</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><span>CURATED NOW</span><h2>本週選品</h2></div><Link href={`/store/${tenant}/products`}>看全部商品 <ArrowRight size={16} /></Link></div>
        <div className={styles.productGrid}>
          {products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} />)}
        </div>
      </section>

      <section className={styles.editorial}>
        <div className={styles.editorialImage}><img src="https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=82" alt="極簡服飾系列穿搭" loading="lazy" /></div>
        <div className={styles.editorialCopy}>
          <span className={styles.eyebrow}>EDITORIAL 06</span>
          <h2>一件衣服，<br />三種生活節奏。</h2>
          <p>從通勤、午後散步到週末旅行，以相同單品創造足夠舒適、也足夠俐落的日常。</p>
          <Link href={`/store/${tenant}/campaigns`} className={styles.outlineButton}>閱讀最新活動 <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className={styles.integration}>
        <div><span className={styles.eyebrow}>ONE COMMERCE CORE</span><h2>網站下單，後台立刻接手。</h2><p>此試用店已示範品牌專屬網域、共用商品與庫存、會員累積、訂單查詢及付款流程。</p></div>
        <div className={styles.flow}>
          <FlowStep icon={<ShoppingBag />} label="品牌官網" meta="新訂單 #260723" />
          <ChevronRight />
          <FlowStep icon={<Box />} label="ERP 訂單" meta="待出貨" />
          <ChevronRight />
          <FlowStep icon={<Warehouse />} label="可售庫存" meta="保留 1 件" />
          <ChevronRight />
          <FlowStep icon={<BarChart3 />} label="營運報表" meta="即時更新" />
        </div>
      </section>
    </>
  );
}

function ProductCard({ product, addToCart }: { product: Product; addToCart: AddToCart }) {
  return (
    <article className={styles.productCard}>
      <div className={styles.productImage}>
        {product.badge && <span>{product.badge}</span>}
        <button aria-label={`收藏 ${product.name}`}><Heart size={18} /></button>
        <img src={product.image} alt={product.name} loading="lazy" />
        <button className={styles.quickAdd} onClick={() => addToCart(product)}>快速加入購物車 <Plus size={16} /></button>
      </div>
      <div className={styles.productMeta}>
        <div><small>{product.category} ・ {product.sku || product.id}</small><h3>{product.name}</h3></div>
        <div className={styles.price}><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</div>
        <div className={styles.stockLine}><span className={product.stock < 10 ? styles.lowStock : ""} />{product.stock < 10 ? `僅餘 ${product.stock} 件` : "現貨供應"} ・ {product.colors.join(" / ")}</div>
      </div>
    </article>
  );
}

function ProductsView({ products, addToCart }: { products: Product[]; addToCart: AddToCart }) {
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const categories = ["全部", ...Array.from(new Set(products.map((product) => product.category)))];
  const filtered = products.filter((product) => (category === "全部" || product.category === category)
    && (!query.trim() || `${product.name} ${product.sku || product.id}`.toLowerCase().includes(query.toLowerCase())));

  return (
    <section className={styles.catalogPage}>
      <div className={styles.pageIntro}><span className={styles.eyebrow}>ONLINE COLLECTION</span><h1>所有商品</h1><p>網站可售數量直接讀取各租戶 ERP 庫存，避免超賣與重複維護。</p></div>
      <div className={styles.catalogTools}>
        <div className={styles.categoryTabs}>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? styles.selectedTab : ""}>{item}</button>)}</div>
        <label className={styles.searchBox}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋商品或貨號" /></label>
      </div>
      <div className={styles.catalogCount}>{filtered.length} 件商品 <span>・庫存更新於剛剛</span></div>
      <div className={styles.catalogGrid}>{filtered.map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} />)}</div>
    </section>
  );
}

function CampaignsView({ tenant, products, addToCart }: { tenant: string; products: Product[]; addToCart: AddToCart }) {
  return (
    <section className={styles.campaignPage}>
      <div className={styles.pageIntro}><span className={styles.eyebrow}>STORIES & OFFERS</span><h1>最新活動</h1><p>品牌企劃與優惠券可由 ERP 後台設定期間、會員條件及適用商品。</p></div>
      <div className={styles.campaignHero}>
        <img src="https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=1500&q=84" alt="本月服飾企劃" />
        <div><span>07.23—08.16</span><h2>THE SOFT STRUCTURE</h2><p>任選兩件 9 折，會員再享 2% 點數回饋。</p><Link href={`/store/${tenant}/products`} className={styles.lightButton}>選購活動商品 <ArrowRight size={16} /></Link></div>
      </div>
      <div className={styles.couponGrid}>
        <article><TicketPercent /><div><span>新會員首購</span><strong>WELCOME200</strong><p>單筆滿 NT$1,500 折 NT$200</p></div><button onClick={() => navigator.clipboard?.writeText("WELCOME200")}>複製</button></article>
        <article><Gift /><div><span>門市取貨限定</span><strong>PICKUP100</strong><p>選擇門市取貨現折 NT$100</p></div><button onClick={() => navigator.clipboard?.writeText("PICKUP100")}>複製</button></article>
      </div>
      <div className={styles.sectionHeading}><div><span>CAMPAIGN PICKS</span><h2>活動選品</h2></div></div>
      <div className={styles.productGrid}>{products.slice(1, 5).map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} />)}</div>
    </section>
  );
}

function CartView({ tenant, lines, subtotal, updateLine }: {
  tenant: string;
  lines: Array<CartLine & { product: Product }>;
  subtotal: number;
  updateLine: (line: CartLine, quantity: number) => void;
}) {
  return (
    <section className={styles.checkoutPage}>
      <div className={styles.pageIntro}><span className={styles.eyebrow}>YOUR SELECTION</span><h1>購物車</h1><p>結帳時會再次檢查 ERP 可售量；網路訂單先保留可售量，實際出貨才扣實體庫存並立應收。</p></div>
      {lines.length === 0 ? <EmptyCart tenant={tenant} /> : (
        <div className={styles.cartLayout}>
          <div className={styles.cartLines}>{lines.map((line) => <CartLineRow key={`${line.productId}-${line.size}-${line.color}`} line={line} updateLine={updateLine} />)}</div>
          <OrderSummary tenant={tenant} subtotal={subtotal} />
        </div>
      )}
    </section>
  );
}

function CheckoutView({ tenant, lines, subtotal, saveOrder, storeLive, acceptingOrders }: {
  tenant: string;
  lines: Array<CartLine & { product: Product }>;
  subtotal: number;
  saveOrder: (order: Order) => void;
  storeLive: boolean;
  acceptingOrders: boolean;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState("CARD");
  const [delivery, setDelivery] = useState("HOME");
  const [completed, setCompleted] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const shipping = subtotal >= 2000 || delivery === "PICKUP" ? 0 : 120;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length || submitting || !acceptingOrders) return;
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    if (!storeLive) {
      window.setTimeout(() => {
        const order: Order = {
          id: `DEMO-${String(Date.now()).slice(-8)}`,
          createdAt: new Date().toISOString(),
          status: "展示訂單・未送出",
          total: subtotal + shipping,
          items: lines.reduce((sum, line) => sum + line.quantity, 0),
          recipient: String(form.get("name") || "試用會員"),
        };
        saveOrder(order);
        setCompleted(order);
        setSubmitting(false);
      }, 500);
      return;
    }

    try {
      const response = await fetch(`/api/store/${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          customer: {
            name: String(form.get("name") || ""),
            phone: String(form.get("phone") || ""),
            email: String(form.get("email") || ""),
            address: delivery === "HOME" ? String(form.get("address") || "") : "",
          },
          delivery,
          payment,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            size: line.size,
            color: line.color,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "訂單建立失敗");
      saveOrder(result.order);
      setCompleted(result.order);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "訂單建立失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    const isDemo = completed.status.startsWith("展示訂單");
    return <section className={styles.successPage}><div className={styles.successIcon}><Check /></div><span className={styles.eyebrow}>ORDER CONFIRMED</span><h1>{isDemo ? "展示流程已完成" : "訂單已建立"}</h1><p>{isDemo ? `${completed.id} 只保留在此瀏覽器，不會寫入正式 ERP。` : `${completed.id} 已自動建立於商家 ERP；可售量已保留，出貨時再扣實體庫存並建立應收。`}</p><div className={styles.successFacts}><span>訂單金額<strong>{money(completed.total)}</strong></span><span>處理狀態<strong>{completed.status}</strong></span><span>預計出貨<strong>{isDemo ? "展示模式" : "1—2 個工作日"}</strong></span></div><button className={styles.primaryButton} onClick={() => router.push(`/store/${tenant}/orders`)}>查看訂單進度 <ArrowRight size={16} /></button></section>;
  }

  if (!lines.length) return <section className={styles.checkoutPage}><EmptyCart tenant={tenant} /></section>;
  return (
    <section className={styles.checkoutPage}>
      <div className={styles.pageIntro}><span className={styles.eyebrow}>SECURE CHECKOUT</span><h1>安心結帳</h1><p>{storeLive ? "送出後會由伺服器重新計價、檢查庫存並自動建立 ERP 銷售單；金流完成狀態須由租戶設定的支付服務回傳。" : "目前是功能展示，不會產生真實扣款，也不會寫入正式 ERP。"}</p></div>
      <form className={styles.checkoutLayout} onSubmit={submit}>
        <div className={styles.checkoutForms}>
          <fieldset><legend><span>1</span> 收件資料</legend><div className={styles.formGrid}><label>姓名<input name="name" required defaultValue="王小美" /></label><label>手機<input name="phone" required inputMode="tel" defaultValue="0912-345-678" /></label><label className={styles.fullField}>電子信箱<input name="email" required type="email" defaultValue="demo@example.com" /></label></div></fieldset>
          <fieldset><legend><span>2</span> 配送方式</legend><div className={styles.choiceGrid}><Choice active={delivery === "HOME"} onClick={() => setDelivery("HOME")} icon={<Truck />} title="宅配到府" meta={subtotal >= 2000 ? "已達免運門檻" : "運費 NT$120"} /><Choice active={delivery === "PICKUP"} onClick={() => setDelivery("PICKUP")} icon={<Store />} title="門市取貨" meta="最快 2 小時 ・ 免費" /></div>{delivery === "HOME" && <label className={styles.addressField}>配送地址<input name="address" required placeholder="縣市、區域、路段、門牌" defaultValue="台北市信義區松高路 1 號" /></label>}</fieldset>
          <fieldset><legend><span>3</span> 付款方式</legend><div className={styles.choiceGrid}><Choice active={payment === "CARD"} onClick={() => setPayment("CARD")} icon={<CreditCard />} title="信用卡" meta="由租戶金流設定處理" /><Choice active={payment === "MOBILE"} onClick={() => setPayment("MOBILE")} icon={<WalletCards />} title="行動支付" meta="由租戶金流設定處理" /><Choice active={payment === "TRANSFER"} onClick={() => setPayment("TRANSFER")} icon={<Clock3 />} title="銀行轉帳" meta="保留可售量 24 小時" /></div></fieldset>
        </div>
        <aside className={styles.checkoutSummary}><h2>訂單摘要</h2>{lines.map((line) => <div key={`${line.productId}-${line.size}`} className={styles.miniLine}><img src={line.product.image} alt="" /><span>{line.product.name}<small>{line.color} / {line.size} ・ {line.quantity} 件</small></span><strong>{money(line.product.price * line.quantity)}</strong></div>)}<SummaryRows subtotal={subtotal} shipping={shipping} />{error && <div className={styles.checkoutError}>{error}</div>}<button type="submit" disabled={submitting || !acceptingOrders} className={styles.payButton}>{submitting ? "建立訂單中…" : !acceptingOrders ? "商城目前暫停接單" : `送出訂單 ${money(subtotal + shipping)}`} <ShieldCheck size={17} /></button><p><ShieldCheck size={14} /> TLS 加密傳輸 ・ {storeLive ? "伺服器端重新驗價與租戶隔離" : "展示模式不會真實扣款"}</p></aside>
      </form>
    </section>
  );
}

function Choice({ active, onClick, icon, title, meta }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; meta: string }) {
  return <button type="button" onClick={onClick} className={active ? styles.activeChoice : ""}>{icon}<span><strong>{title}</strong><small>{meta}</small></span>{active && <Check className={styles.choiceCheck} />}</button>;
}

function MemberView({ tenant, orderCount }: { tenant: string; orderCount: number }) {
  return (
    <section className={styles.memberPage}>
      <div className={styles.memberHero}><div className={styles.memberAvatar}>王</div><div><span>WELCOME BACK</span><h1>王小美，午安</h1><p>NOIR MEMBER ・ 加入於 2026/03/12</p></div><button>編輯會員資料</button></div>
      <div className={styles.memberStats}><article><span>可用點數</span><strong>1,280</strong><small>100 點可折 NT$100</small></article><article><span>會員等級</span><strong>SILVER</strong><small>再消費 NT$3,600 升等</small></article><article><span>有效優惠券</span><strong>3</strong><small>最近到期：08/16</small></article><article><span>累積訂單</span><strong>{orderCount + 8}</strong><small>線上與門市合併計算</small></article></div>
      <div className={styles.memberPanels}>
        <article><div className={styles.panelTitle}><h2>快速入口</h2></div><Link href={`/store/${tenant}/orders`}><PackageCheck />訂單查詢<span>查看出貨與取貨進度</span><ChevronRight /></Link><Link href={`/store/${tenant}/campaigns`}><TicketPercent />我的優惠券<span>3 張可使用</span><ChevronRight /></Link><button><Heart />收藏清單<span>已收藏 5 件商品</span><ChevronRight /></button></article>
        <article><div className={styles.panelTitle}><h2>會員專屬</h2><span>ERP CRM 同步</span></div><div className={styles.tierProgress}><div><span>本年度累積</span><strong>NT$8,400 / NT$12,000</strong></div><i><b /></i><p>消費與點數會合併門市 POS 紀錄，跨通路仍是同一位顧客。</p></div></article>
      </div>
    </section>
  );
}

function OrdersView({ orders }: { orders: Order[] }) {
  const [query, setQuery] = useState("");
  const demoOrders: Order[] = [
    { id: "EC2607181042", createdAt: "2026-07-18T08:30:00.000Z", status: "配送中", total: 3960, items: 2, recipient: "王小美" },
    { id: "EC2607010821", createdAt: "2026-07-01T04:12:00.000Z", status: "已完成", total: 2680, items: 1, recipient: "王小美" },
  ];
  const rows = [...orders, ...demoOrders].filter((order) => !query || order.id.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className={styles.orderPage}>
      <div className={styles.pageIntro}><span className={styles.eyebrow}>TRACK YOUR ORDER</span><h1>訂單查詢</h1><p>網路訂單、門市取貨與 POS 交易可在會員識別後集中查詢。</p></div>
      <label className={styles.orderSearch}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入訂單編號，例如 EC2607181042" /></label>
      <div className={styles.orderList}>{rows.map((order) => <article key={order.id}><div className={styles.orderTop}><div><span>{order.id}</span><small>{new Date(order.createdAt).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" })}</small></div><b className={order.status === "已完成" ? styles.doneStatus : ""}>{order.status}</b></div><div className={styles.orderBody}><div><PackageCheck /><span>{order.items} 件商品<strong>{order.recipient}</strong></span></div><strong>{money(order.total)}</strong><button>查看明細 <ChevronRight /></button></div><OrderTimeline status={order.status} /></article>)}</div>
      {rows.length === 0 && <div className={styles.emptyState}><Search /><h2>找不到這筆訂單</h2><p>請確認訂單編號，或登入會員中心查看全部紀錄。</p></div>}
    </section>
  );
}

function OrderTimeline({ status }: { status: string }) {
  const completed = status === "已完成";
  return <div className={styles.timeline}><span className={styles.timelineDone}>訂單成立</span><i /><span className={styles.timelineDone}>付款完成</span><i /><span className={styles.timelineDone}>理貨出貨</span><i /><span className={completed ? styles.timelineDone : ""}>{completed ? "已送達" : "配送中"}</span></div>;
}

function CartDrawer({ open, close, tenant, lines, subtotal, updateLine }: {
  open: boolean;
  close: () => void;
  tenant: string;
  lines: Array<CartLine & { product: Product }>;
  subtotal: number;
  updateLine: (line: CartLine, quantity: number) => void;
}) {
  return (
    <>
      <button className={`${styles.drawerBackdrop} ${open ? styles.drawerBackdropOpen : ""}`} onClick={close} aria-label="關閉購物車" />
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} aria-hidden={!open}>
        <div className={styles.drawerHeader}><div><span>YOUR BAG</span><h2>購物車 ・ {lines.reduce((sum, line) => sum + line.quantity, 0)} 件</h2></div><button onClick={close} aria-label="關閉購物車"><X /></button></div>
        <div className={styles.drawerContent}>{lines.length ? lines.map((line) => <CartLineRow key={`${line.productId}-${line.size}-${line.color}`} line={line} updateLine={updateLine} compact />) : <div className={styles.emptyCart}><ShoppingBag /><h3>購物車還是空的</h3><p>先從本週選品找到適合你的日常單品。</p></div>}</div>
        {lines.length > 0 && <div className={styles.drawerFooter}><div><span>商品小計</span><strong>{money(subtotal)}</strong></div><p>還差 {money(Math.max(0, 2000 - subtotal))} 即享免運</p><Link href={`/store/${tenant}/checkout`} onClick={close}>前往結帳 <ArrowRight /></Link><Link href={`/store/${tenant}/cart`} onClick={close} className={styles.drawerSecondary}>檢視購物車</Link></div>}
      </aside>
    </>
  );
}

function CartLineRow({ line, updateLine, compact = false }: {
  line: CartLine & { product: Product };
  updateLine: (line: CartLine, quantity: number) => void;
  compact?: boolean;
}) {
  return <div className={`${styles.cartLine} ${compact ? styles.compactLine : ""}`}><img src={line.product.image} alt={line.product.name} /><div className={styles.cartLineInfo}><span>{line.product.id}</span><h3>{line.product.name}</h3><p>{line.color} / {line.size}</p><div className={styles.quantity}><button onClick={() => updateLine(line, line.quantity - 1)} aria-label="減少數量"><Minus /></button><strong>{line.quantity}</strong><button onClick={() => updateLine(line, line.quantity + 1)} aria-label="增加數量"><Plus /></button></div></div><div className={styles.cartLinePrice}><strong>{money(line.product.price * line.quantity)}</strong><button onClick={() => updateLine(line, 0)} aria-label="移除商品"><Trash2 /></button></div></div>;
}

function OrderSummary({ tenant, subtotal }: { tenant: string; subtotal: number }) {
  const shipping = subtotal >= 2000 ? 0 : 120;
  return <aside className={styles.orderSummary}><h2>訂單摘要</h2><SummaryRows subtotal={subtotal} shipping={shipping} /><Link href={`/store/${tenant}/checkout`}>前往結帳 <ArrowRight /></Link><p><ShieldCheck /> 安全付款 ・ 7 日鑑賞期</p></aside>;
}

function SummaryRows({ subtotal, shipping }: { subtotal: number; shipping: number }) {
  return <div className={styles.summaryRows}><span>商品小計<strong>{money(subtotal)}</strong></span><span>運費<strong>{shipping ? money(shipping) : "免運"}</strong></span><span>優惠折抵<strong>—</strong></span><span className={styles.summaryTotal}>應付總額<strong>{money(subtotal + shipping)}</strong></span></div>;
}

function EmptyCart({ tenant }: { tenant: string }) {
  return <div className={styles.emptyState}><ShoppingBag /><h2>購物車還是空的</h2><p>從本週選品開始，找到適合你的日常單品。</p><Link href={`/store/${tenant}/products`} className={styles.primaryButton}>前往選購 <ArrowRight /></Link></div>;
}

function FlowStep({ icon, label, meta }: { icon: React.ReactNode; label: string; meta: string }) {
  return <div className={styles.flowStep}><span>{icon}</span><strong>{label}</strong><small>{meta}</small></div>;
}
