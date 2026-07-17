const message = document.getElementById("message");
const ready = document.getElementById("ready");
const setup = document.getElementById("setup");
const companyCode = document.getElementById("companyCode");
const serverUrl = document.getElementById("serverUrl");
const activationKey = document.getElementById("activationKey");
const caName = document.getElementById("caName");
const manualMode = document.getElementById("manualMode");
const manualFields = document.getElementById("manualFields");
const saveButton = document.getElementById("saveButton");
const resetButton = document.getElementById("resetButton");
const clearButton = document.getElementById("clearButton");
let caCertificate = "";
let hasAttemptedConnection = false;

function friendlyError(error) {
  let value = error?.message || String(error || "連線失敗");
  value = value
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^ServiceError:\s*/i, "")
    .trim();

  if (/尚未完成自動連線設定|discovery/i.test(value)) {
    return "公司主機尚未安裝完成。請先在公司選定的主機電腦完成 Host 安裝，待後台顯示公司主機 1/1 後再重新連線。";
  }
  if (/公司代碼或啟用碼無效|啟用碼格式錯誤/i.test(value)) {
    return "公司代碼或啟用碼不正確，請重新確認後再連線。";
  }
  if (/連線逾時|ECONNREFUSED|ENOTFOUND|socket hang up/i.test(value)) {
    return "目前無法連上公司主機。請確認公司主機已開機、Docker 正常執行，而且工作站與主機位於同一個公司網路。";
  }
  if (/公司主機回覆\s*\d+/i.test(value)) {
    return "公司主機已回應，但服務尚未準備完成，請稍候約 1 分鐘後再重新連線。";
  }
  return value || "連線失敗，請稍後再試。";
}

function showMessage(value, kind = "error") {
  message.textContent = value || "";
  message.dataset.kind = kind;
  message.hidden = !value;
}

function render(state) {
  ready.hidden = !state.configured;
  setup.hidden = state.configured;
  companyCode.value = state.companyCode || "";
  serverUrl.value = state.serverUrl || "";
  if (state.configured) {
    document.getElementById("readyCompany").textContent = state.companyCode || "手動設定";
    document.getElementById("readyServer").textContent = state.serverUrl;
    document.getElementById("readyDevice").textContent = state.deviceId;
    document.getElementById("readyExpiry").textContent = state.expiresAt
      ? new Date(state.expiresAt).toLocaleString("zh-TW")
      : "開啟後自動取得";
  }
}

manualMode.addEventListener("change", () => {
  manualFields.hidden = !manualMode.checked;
  companyCode.required = !manualMode.checked;
  saveButton.textContent = manualMode.checked ? "驗證席次並連線" : "自動尋找公司並驗證席次";
});

document.getElementById("chooseCa").addEventListener("click", async () => {
  showMessage("");
  try {
    const value = await window.erinDesktop.chooseCa();
    if (value) {
      caCertificate = value;
      caName.value = "ca.crt（已載入）";
    }
  } catch (error) { showMessage(friendlyError(error)); }
});

setup.addEventListener("submit", async (event) => {
  event.preventDefault();
  hasAttemptedConnection = true;
  showMessage("");
  if (manualMode.checked && !caCertificate) return showMessage("手動設定模式請先選擇公司主機提供的 ca.crt");
  if (!manualMode.checked && !companyCode.value.trim()) return showMessage("請輸入公司代碼");
  saveButton.disabled = true;
  saveButton.textContent = manualMode.checked ? "驗證中央席次與公司主機…" : "查詢公司並驗證席次…";
  try {
    const state = await window.erinDesktop.save({
      companyCode: companyCode.value,
      serverUrl: serverUrl.value,
      activationKey: activationKey.value,
      caCertificate,
      manualMode: manualMode.checked,
    });
    activationKey.value = "";
    render(state);
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = manualMode.checked ? "驗證席次並連線" : "自動尋找公司並驗證席次";
  }
});

document.getElementById("openButton").addEventListener("click", async () => {
  showMessage("");
  try { await window.erinDesktop.open(); } catch (error) { showMessage(friendlyError(error)); }
});

async function clearStoredConnection() {
  if (!confirm("要清除這台電腦保存的公司主機、公司代碼與啟用碼設定嗎？裝置身分會保留，不會因此新增授權席次。")) return;
  hasAttemptedConnection = false;
  caCertificate = "";
  caName.value = "";
  companyCode.value = "";
  serverUrl.value = "";
  activationKey.value = "";
  manualMode.checked = false;
  manualFields.hidden = true;
  const state = await window.erinDesktop.reset();
  render(state);
  showMessage("舊連線設定已清除，請重新輸入公司代碼與啟用碼。", "success");
}

resetButton.addEventListener("click", () => void clearStoredConnection().catch((error) => showMessage(friendlyError(error))));
clearButton.addEventListener("click", () => void clearStoredConnection().catch((error) => showMessage(friendlyError(error))));

window.erinDesktop.onError((value) => {
  // 啟動時可能收到上一次自動連線失敗的舊訊息；使用者尚未按下連線前不顯示。
  if (!hasAttemptedConnection) return;
  showMessage(friendlyError(value));
});

window.erinDesktop.state()
  .then((state) => {
    showMessage("");
    render(state);
  })
  .catch(() => {
    // 初次開啟不顯示 Electron 工程錯誤，仍讓使用者可清除並重新輸入設定。
    render({ configured: false, companyCode: "", serverUrl: "", deviceId: "", expiresAt: null });
  });
