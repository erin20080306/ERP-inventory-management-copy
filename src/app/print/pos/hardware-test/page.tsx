import { AutoPrint } from "../../auto-print";

export default function PosHardwarePrintTestPage() {
  return (
    <>
      <AutoPrint />
      <article className="pos-receipt">
        <header className="pos-receipt-header"><h1>艾琳 ERP／POS</h1><div>80mm 印表機驗收測試</div><div>中文：進銷存・餐飲・零售</div></header>
        <div className="pos-receipt-warning">測試頁／不是發票</div>
        <dl className="pos-receipt-meta"><div><dt>紙張</dt><dd>80mm 熱感紙</dd></div><div><dt>列印時間</dt><dd>{new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</dd></div><div><dt>字元測試</dt><dd>ABC 123 !@#</dd></div></dl>
        <table className="pos-receipt-items"><thead><tr><th>品項</th><th>數量</th><th>金額</th></tr></thead><tbody><tr><td><strong>中文長商品名稱測試</strong><small>SKU-TEST-001</small></td><td>2</td><td>100</td></tr><tr><td><strong>餐飲備註：少冰／不辣</strong><small>字型與換行不可截斷</small></td><td>1</td><td>80</td></tr></tbody></table>
        <section className="pos-receipt-totals"><div><span>小計</span><strong>NT$ 180</strong></div><div><span>稅額</span><strong>NT$ 9</strong></div><div className="grand"><span>總額</span><strong>NT$ 189</strong></div></section>
        <footer><div>請核對：紙寬、中文字、濃度、換行、進紙與切紙</div><div>=== CUT HERE／切紙線 ===</div></footer>
      </article>
    </>
  );
}
