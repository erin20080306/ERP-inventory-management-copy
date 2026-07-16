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
let caCertificate = "";

function showMessage(value) {
  message.textContent = value || "";
  message.hidden = !value;
}

function render(state) {
  showMessage(state.error);
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
  } catch (error) { showMessage(error.message || String(error)); }
});

setup.addEventListener("submit", async (event) => {
  event.preventDefault();
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
  } catch (error) { showMessage(error.message || String(error)); }
  finally {
    saveButton.disabled = false;
    saveButton.textContent = manualMode.checked ? "驗證席次並連線" : "自動尋找公司並驗證席次";
  }
});

document.getElementById("openButton").addEventListener("click", async () => {
  showMessage("");
  try { await window.erinDesktop.open(); } catch (error) { showMessage(error.message || String(error)); }
});

document.getElementById("resetButton").addEventListener("click", async () => {
  if (!confirm("要清除公司主機與啟用碼設定嗎？此電腦的裝置身分會保留，不會因此取得新席次。")) return;
  caCertificate = "";
  caName.value = "";
  companyCode.value = "";
  activationKey.value = "";
  render(await window.erinDesktop.reset());
});

window.erinDesktop.onError(showMessage);
window.erinDesktop.state().then(render).catch((error) => showMessage(error.message || String(error)));
