// 權限定義
export const MODULES = [
  "dashboard",
  "products",
  "customers",
  "suppliers",
  "purchases",
  "sales",
  "quotations",
  "inventory",
  "warehouses",
  "returns",
  "pos",
  "restaurant",
  "medical",
  "accounting",
  "journals",
  "receivables",
  "payables",
  "cash",
  "invoices",
  "notes",
  "assets",
  "hr",
  "payroll",
  "attendance",
  "reports",
  "users",
  "roles",
  "settings",
  "audit",
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ["view", "create", "edit", "delete", "export", "submit", "approve", "reject", "post", "void", "manage"] as const;
export type Action = (typeof ACTIONS)[number];

// 中文對照
export const MODULE_LABELS: Record<Module, string> = {
  dashboard: "儀表板",
  products: "商品管理",
  customers: "客戶管理",
  suppliers: "供應商管理",
  purchases: "採購管理",
  sales: "銷售管理",
  quotations: "報價單",
  inventory: "庫存管理",
  warehouses: "倉庫管理",
  returns: "退貨管理",
  pos: "POS 收銀前台",
  restaurant: "餐飲桌位／廚房",
  medical: "醫美預約／療程紀錄",
  accounting: "會計科目",
  journals: "傳票管理",
  receivables: "應收帳款",
  payables: "應付帳款",
  cash: "現金銀行",
  invoices: "發票管理",
  notes: "票據管理",
  assets: "固定資產",
  hr: "人事管理",
  payroll: "薪資管理",
  attendance: "出勤管理",
  reports: "財務報表",
  users: "使用者管理",
  roles: "角色權限",
  settings: "系統設定",
  audit: "稽核紀錄",
};

export const ACTION_LABELS: Record<Action, string> = {
  view: "查看",
  create: "新增",
  edit: "編輯",
  delete: "刪除",
  export: "匯出",
  submit: "送審",
  approve: "審核",
  reject: "駁回",
  post: "過帳",
  void: "作廢",
  manage: "全部管理",
};

export const ALL_PERMISSIONS: { code: string; module: Module; action: Action; description: string }[] = MODULES.flatMap(
  (m) =>
    ACTIONS.map((a) => ({
      code: `${m}.${a}`,
      module: m,
      action: a,
      description: `${m} - ${a}`,
    }))
);

// 預設角色與權限對應
export const DEFAULT_ROLES = {
  SUPER_ADMIN: { name: "系統管理員", permissions: "*" as const },
  OWNER: {
    name: "老闆 / 經營者",
    permissions: ALL_PERMISSIONS.filter((p) => !["users", "roles"].includes(p.module) || p.action === "view").map(
      (p) => p.code
    ),
  },
  ACCOUNTANT: {
    name: "會計人員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "accounting", "journals", "receivables", "payables", "cash", "invoices", "notes", "assets", "reports"].includes(p.module)
    ).map((p) => p.code),
  },
  PURCHASER: {
    name: "採購人員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "products", "suppliers", "purchases", "inventory", "returns", "reports"].includes(p.module)
    )
      .filter((p) => !["delete", "approve", "manage"].includes(p.action))
      .map((p) => p.code),
  },
  SALES: {
    name: "銷售人員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "products", "customers", "sales", "quotations", "inventory", "returns", "reports"].includes(p.module)
    )
      .filter((p) => !["delete", "approve", "manage"].includes(p.action))
      .map((p) => p.code),
  },
  POS_CASHIER: {
    name: "POS 收銀員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "pos", "products", "customers", "sales", "returns"].includes(p.module)
    )
      .filter((p) => !["delete", "approve", "manage"].includes(p.action))
      .map((p) => p.code),
  },
  RESTAURANT_SERVICE: {
    name: "餐飲外場人員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "pos", "restaurant", "products", "customers", "sales"].includes(p.module)
    )
      .filter((p) => !["delete", "approve", "manage"].includes(p.action))
      .map((p) => p.code),
  },
  MEDICAL_STAFF: {
    name: "醫美櫃台／療程人員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "pos", "medical", "products", "customers", "sales", "inventory"].includes(p.module)
    )
      .filter((p) => !["delete", "approve", "manage"].includes(p.action))
      .map((p) => p.code),
  },
  KITCHEN: {
    name: "廚房人員",
    permissions: ALL_PERMISSIONS.filter((p) => p.module === "restaurant" && ["view", "edit"].includes(p.action)).map((p) => p.code),
  },
  WAREHOUSE: {
    name: "倉管人員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "products", "inventory", "warehouses", "returns"].includes(p.module)
    ).map((p) => p.code),
  },
  HR: {
    name: "HR 專員",
    permissions: ALL_PERMISSIONS.filter((p) =>
      ["dashboard", "hr", "payroll", "attendance", "reports"].includes(p.module)
    )
      .filter((p) => !["delete", "approve", "manage"].includes(p.action))
      .map((p) => p.code),
  },
  VIEWER: {
    name: "一般查詢人員",
    permissions: ALL_PERMISSIONS.filter((p) => p.action === "view").map((p) => p.code),
  },
} as const;
