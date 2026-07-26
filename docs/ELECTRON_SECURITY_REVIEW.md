# Electron 安全審查

審查範圍：`desktop/v107-bootstrap.cjs`、`v106-bootstrap.cjs`、`bootstrap.cjs`、`main.cjs`、preload 與打包設定。

## 已有控制

- 主視窗使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 啟用碼與 Ed25519 私鑰透過 `safeStorage` 保存。
- 公司主機使用安裝時 CA 憑證驗證，工作站請求加入短效租約、nonce、時間戳與 Ed25519 proof。
- 外部視窗預設拒絕，HTTPS 連結交由系統瀏覽器開啟。
- IPC 硬體功能會檢查呼叫者是否為 ERP 主視窗。

## 本批修正

新增 `security-bootstrap.cjs` 並放在所有相容啟動器之前：

- 全域啟用 Electron sandbox。
- 禁止任何 `<webview>` 附加。
- 封鎖非 `https:`、含帳密或無效網址的外部開啟。
- 對所有新 webContents 套用 navigation 與 window-open 最小權限防護。
- 保留 `data:` 僅供本程式內建狀態頁使用；其他非 HTTPS/本機代理導覽一律阻擋。

## 尚需持續觀察

本機 loopback proxy 仍是高敏感邊界。現在已由 Electron 視窗導覽限制、工作站簽章與 Host 端驗證共同防護；後續桌面大版本應加入每次啟動隨機 renderer token，並將 token 綁定到代理請求，進一步降低同機惡意網頁碰撞 localhost port 的風險。

## 發布檢查

每次桌面發布需執行 `npm run test:desktop`，並確認：

1. 打包後入口仍為 `security-bootstrap.cjs`。
2. `security-bootstrap.cjs` 最後載入 `v107-bootstrap.cjs`。
3. 所有 BrowserWindow 維持 sandbox/contextIsolation。
4. macOS 與 Windows 安裝包不攜帶未使用的 Node 模組。
