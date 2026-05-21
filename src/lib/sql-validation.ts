/**
 * SQL注入檢測與防護機制
 * 檢測常見的SQL注入模式並返回錯誤
 */

const SQL_INJECTION_PATTERNS = [
  // 常見的 SQL 注入關鍵字
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|UNION|WHERE|OR|AND)\b)/i,
  // 註釋符號
  /(--|\/\*|\*\/|;)/,
  // 引號與括號組合
  /('(\s)*(=|OR|AND))/i,
  /("(\s)*(=|OR|AND))/i,
  // 十六進制編碼
  /(0x[0-9a-fA-F]+)/,
  // 編碼的字符
  /(%27|%2D|%2F|%3B|%3D|%7C|%22|%27)/i,
  // 堆疊查詢
  /(\s)(;)(\s)/,
  // 條件邏輯注入
  /(1\s*=\s*1|1\s*!=\s*0|true)/i,
];

/**
 * 檢查輸入是否包含 SQL 注入模式
 * @param input 要檢查的輸入字串
 * @returns 如果檢測到 SQL 注入返回 true，否則返回 false
 */
export function detectSQLInjection(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 驗證物件的所有字串欄位是否包含 SQL 注入
 * @param obj 要驗證的物件
 * @returns 如果檢測到 SQL 注入返回 true，否則返回 false
 */
export function validateObjectForSQLInjection(obj: any): { isValid: boolean; detectedFields: string[] } {
  const detectedFields: string[] = [];
  
  function traverse(value: any, path: string = '') {
    if (typeof value === 'string') {
      if (detectSQLInjection(value)) {
        detectedFields.push(path || value);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => traverse(item, `${path}[${index}]`));
    } else if (typeof value === 'object' && value !== null) {
      Object.keys(value).forEach(key => {
        traverse(value[key], path ? `${path}.${key}` : key);
      });
    }
  }
  
  traverse(obj);
  
  return {
    isValid: detectedFields.length === 0,
    detectedFields,
  };
}

/**
 * 淨化輸入字串（移除潛在危險字符）
 * @param input 要淨化的輸入字串
 * @returns 淨化後的字串
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  // 移除 SQL 注入相關字符
  return input
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/;/g, '')
    .replace(/'/g, "''")
    .trim();
}
