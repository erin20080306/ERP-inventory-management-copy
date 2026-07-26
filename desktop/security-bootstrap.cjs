const { app, shell } = require("electron");

process.env.ELECTRON_ENABLE_SECURITY_WARNINGS = "true";
app.enableSandbox();

function parsedUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function isLoopback(url) {
  return url.protocol === "http:"
    && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function isSafeExternal(url) {
  return url.protocol === "https:" && !url.username && !url.password;
}

function sameOrigin(leftValue, rightValue) {
  const left = parsedUrl(leftValue);
  const right = parsedUrl(rightValue);
  return Boolean(left && right && left.origin === right.origin);
}

function allowInternalNavigation(targetValue, currentValue) {
  const target = parsedUrl(targetValue);
  if (!target) return false;
  if (["file:", "data:"].includes(target.protocol)) return true;
  if (isLoopback(target)) return true;
  return sameOrigin(targetValue, currentValue);
}

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());

  contents.setWindowOpenHandler(({ url }) => {
    const target = parsedUrl(url);
    if (target && isSafeExternal(target)) void shell.openExternal(target.toString());
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (allowInternalNavigation(url, contents.getURL())) return;
    event.preventDefault();
    const target = parsedUrl(url);
    if (target && isSafeExternal(target)) void shell.openExternal(target.toString());
  });
});

require("./v107-bootstrap.cjs");
