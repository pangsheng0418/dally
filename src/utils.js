import * as XLSX from 'xlsx';

/**
 * 中文數字字元對照表
 */
const zhChars = {
  '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100
};

/**
 * 將簡單中文數字（如：十二、五、二十一）轉換為阿拉伯數字
 */
export function zhToNum(zhStr) {
  if (!zhStr) return '';
  const str = zhStr.trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  
  let val = 0;
  let temp = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const num = zhChars[char];
    if (num === undefined) {
      return str; // 含有非中文數字，直接返回原字串
    }
    if (num === 10) {
      if (temp === 0) temp = 1;
      val += temp * 10;
      temp = 0;
    } else if (num === 100) {
      if (temp === 0) temp = 1;
      val += temp * 100;
      temp = 0;
    } else {
      temp = num;
    }
  }
  val += temp;
  return val;
}

/**
 * 語音辨識文字格式化優化
 * 例如：將「A棟十二樓之一」轉為「A棟-12F-1」，或將口述的車牌移除空格並轉大寫
 */
export function normalizeVoiceInput(text) {
  if (!text) return '';
  
  // 1. 去除尾部常見標點符號
  let cleaned = text.trim().replace(/[。，？！?.、]/g, '');
  
  // 2. 處理住戶代號口語轉換：例如「A棟十二樓之一」、「B棟五樓之二」、「C棟三樓」
  // 比對格式如：{A-Z/數字/中文}棟 {中文數字/阿拉伯數字}樓之{中文數字/阿拉伯數字}
  const buildingFloorRegex = /([A-Za-z0-9一二三四五六七八九十百]+棟)?\s*([0-9一二三四五六七八九十百]+)\s*樓\s*之\s*([0-9一二三四五六七八九十]+)/i;
  const buildingFloorRegexSimple = /([A-Za-z0-9一二三四五六七八九十百]+棟)?\s*([0-9一二三四五六七八九十百]+)\s*樓/i;
  
  let match = cleaned.match(buildingFloorRegex);
  if (match) {
    const building = match[1] || '';
    const floorZh = match[2];
    const roomZh = match[3];
    
    const floorNum = zhToNum(floorZh);
    const roomNum = zhToNum(roomZh);
    
    const prefix = building ? `${building}-` : '';
    return `${prefix}${floorNum}F-${roomNum}`;
  }
  
  match = cleaned.match(buildingFloorRegexSimple);
  if (match) {
    const building = match[1] || '';
    const floorZh = match[2];
    
    const floorNum = zhToNum(floorZh);
    const prefix = building ? `${building}-` : '';
    return `${prefix}${floorNum}F`;
  }
  
  // 3. 常見的車牌語音處理：英文和數字之間可能有空格，例如「A B C 一二三四」
  // 如果字串包含英文與數字，我們把所有空格移除，並把中文數字轉為阿拉伯數字，然後轉大寫
  if (/[a-zA-Z]/.test(cleaned)) {
    // 移除所有空格
    let noSpaces = cleaned.replace(/\s+/g, '');
    // 將其中的中文數字轉換為阿拉伯數字
    let converted = '';
    for (let char of noSpaces) {
      if (zhChars[char] !== undefined && zhChars[char] < 10) {
        converted += zhChars[char];
      } else {
        converted += char;
      }
    }
    return converted.toUpperCase();
  }
  
  return cleaned;
}

/**
 * 三向超模糊搜尋過濾（優化語音輸入容錯率）
 */
export function filterResidents(residents, query) {
  if (!query) return residents;
  
  const q = query.trim().toLowerCase();
  
  // 超模糊清理函數：移除所有空格、減號、底線，以及常見的住戶單位字詞「棟、樓、之、f、F」
  const cleanForFuzzy = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[\s\-_棟樓之fF]/g, '') // 移除空格、底線、減號、以及單位字元
      .replace(/[^a-z0-9\u4e00-\u9fa5]/gi, ''); // 只保留英數與中文字元
  };

  const qFuzzy = cleanForFuzzy(q);

  return residents.filter(item => {
    // 1. 比對住戶代號
    const itemIdLower = item.id.toLowerCase();
    if (itemIdLower.includes(q)) return true;
    
    const itemIdFuzzy = cleanForFuzzy(item.id);
    if (qFuzzy && itemIdFuzzy.includes(qFuzzy)) return true;
    
    // 2. 比對成員姓名
    const matchMember = item.members.some(member => {
      const memberLower = member.toLowerCase();
      if (memberLower.includes(q)) return true;
      
      const memberFuzzy = cleanForFuzzy(member);
      return qFuzzy && memberFuzzy.includes(qFuzzy);
    });
    if (matchMember) return true;
    
    // 3. 比對車牌號碼 (移除減號後的模糊比對)
    const matchPlate = item.licensePlates.some(plate => {
      const plateLower = plate.toLowerCase();
      if (plateLower.includes(q)) return true;
      
      const plateFuzzy = cleanForFuzzy(plate);
      return qFuzzy && plateFuzzy.includes(qFuzzy);
    });
    if (matchPlate) return true;
    
    // 4. 比對備註
    if (item.notes) {
      const notesLower = item.notes.toLowerCase();
      if (notesLower.includes(q)) return true;
      
      const notesFuzzy = cleanForFuzzy(item.notes);
      return qFuzzy && notesFuzzy.includes(qFuzzy);
    }
    
    return false;
  });
}

/**
 * 分隔字串並清理空白
 * 支援逗號 (全半形)、分號 (全半形)、換行、斜線等
 */
export function splitAndClean(str) {
  if (!str) return [];
  return str
    .split(/[\n,;，；\/\\|]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 解析上傳的 Excel 檔案
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 讀取為二維陣列
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rows.length <= 1) {
          reject(new Error('Excel 檔案內無資料或僅有表頭'));
          return;
        }
        
        const importedData = [];
        
        // 從第二行開始解析 (跳過表頭)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          
          const residentId = row[0] ? String(row[0]).trim() : '';
          if (!residentId) continue; // 住戶代號是核心，不可為空
          
          const membersStr = row[1] ? String(row[1]) : '';
          const platesStr = row[2] ? String(row[2]) : '';
          const notes = row[3] ? String(row[3]).trim() : '';
          
          const members = splitAndClean(membersStr);
          const licensePlates = splitAndClean(platesStr).map(p => p.toUpperCase());
          
          importedData.push({
            id: residentId,
            members,
            licensePlates,
            notes: notes || '無備註'
          });
        }
        
        resolve(importedData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 匯出資料為 Excel 檔案
 */
export function exportToExcel(residents, fileName = '大樓住戶車牌對照表.xlsx') {
  const headers = ['住戶代號', '成員姓名/稱謂', '車牌號碼', '備註'];
  
  const data = residents.map(r => [
    r.id,
    r.members.join(', '),
    r.licensePlates.join(', '),
    r.notes || ''
  ]);
  
  // 組合表頭與資料
  const sheetData = [headers, ...data];
  
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '住戶對照資料');
  
  // 自動調整欄寬
  const maxLens = [15, 25, 25, 30];
  worksheet['!cols'] = maxLens.map(w => ({ wch: w }));
  
  XLSX.writeFile(workbook, fileName);
}

/**
 * 下載 Excel 範本
 */
export function downloadTemplate() {
  const headers = ['住戶代號', '成員姓名/稱謂', '車牌號碼', '備註'];
  const examples = [
    ['A棟-12F-1', '張偉明 (屋主), 林淑芬 (太太)', 'ABC-1234, 5678-XY', '白天常不在家，機車位 B1-102。'],
    ['B棟-05F-2', '陳建國 (屋主)\n陳冠宇 (兒子)', '9988-ZZ', '車位 B2-045。'],
    ['C棟-03F-1', '林志強 (屋主)', '', '目前無汽車，使用腳踏車。']
  ];
  
  const sheetData = [headers, ...examples];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '匯入範本');
  
  worksheet['!cols'] = [15, 30, 30, 40].map(w => ({ wch: w }));
  XLSX.writeFile(workbook, '大樓住戶匯入範本.xlsx');
}
