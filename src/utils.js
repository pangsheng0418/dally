import * as XLSX from 'xlsx';

// 自動從住戶代號推算樓層（例如：A棟-12F-1 -> 12F，B棟-05F-2 -> 5F）
export const inferFloor = (unit) => {
  if (!unit) return '';
  const match = unit.match(/(\d+)\s*(?:F|樓)/i) || unit.match(/[-_](\d{1,2})[-_]/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) return `${num}F`;
  }
  return '';
};

// 中文數字轉換為阿拉伯數字（支援 0~99、兩、十等）
export const chineseNumberToArabic = (str) => {
  if (!str) return str;
  const cnNums = { '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

  return str.replace(/([零一二兩三四五六七八九]?十[零一二兩三四五六七八九]?)/g, (match) => {
    let tens = 1;
    let ones = 0;
    if (match.startsWith('十')) {
      tens = 1;
      ones = cnNums[match[1]] || 0;
    } else {
      tens = cnNums[match[0]] || 1;
      ones = cnNums[match[2]] || 0;
    }
    return String(tens * 10 + ones);
  }).replace(/[零一二兩三四五六七八九]/g, (ch) => cnNums[ch] ?? ch);
};

// 圖片自動壓縮函數（提升為 960px 高清解析度，JPEG 0.82 高畫質）
export const compressImage = (file, maxWidth = 960, quality = 0.82) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// 模糊清理搜尋字串
export const cleanForFuzzy = (text) => {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[\s\-_棟樓之fF:：]/g, '');
};

// 解析欄位導向搜尋語句（支援 樓層: 12F、車牌: ABC、車位: B1、姓名: 王 等）
export const parseFieldQuery = (query) => {
  if (!query) return { field: 'all', keyword: '' };
  const trimmed = query.trim();

  const fieldRegex = /^(樓層|車牌|車位|姓名|成員|住戶|戶號|房號|備註)[:：\s]\s*(.*)$/i;
  const match = trimmed.match(fieldRegex);

  if (match) {
    const rawField = match[1];
    const keyword = match[2].trim();
    let field = 'all';
    if (rawField === '樓層') field = 'floor';
    else if (rawField === '車牌') field = 'plate';
    else if (rawField === '車位') field = 'slot';
    else if (['姓名', '成員'].includes(rawField)) field = 'member';
    else if (['住戶', '戶號', '房號'].includes(rawField)) field = 'unit';
    else if (rawField === '備註') field = 'note';

    return { field, keyword };
  }

  return { field: 'all', keyword: trimmed };
};

// 支援住戶、樓層、成員、車牌、車位多向模糊與指定欄位搜尋
export const filterResidents = (residents, query) => {
  if (!query || !query.trim()) return residents;

  const { field, keyword } = parseFieldQuery(query);
  const cleanQ = cleanForFuzzy(keyword || query);
  if (!cleanQ) return residents;

  return residents.filter((r) => {
    const floor = r.floor || inferFloor(r.unit);
    const cleanFloor = cleanForFuzzy(floor);
    const pureFloorNum = cleanFloor.replace(/\D/g, '');
    const pureQueryNum = cleanQ.replace(/\D/g, '');

    // 樓層匹配：精準數字比對或字串包含（避免搜尋 1F 誤比對到 12F）
    const isFloorMatch = cleanFloor === cleanQ || (pureFloorNum && pureQueryNum && pureFloorNum === pureQueryNum);

    if (field === 'floor') {
      return isFloorMatch;
    }
    if (field === 'plate') {
      return r.plates?.some((p) => cleanForFuzzy(p).includes(cleanQ));
    }
    if (field === 'slot') {
      return r.parkingSlots?.some((s) => cleanForFuzzy(s).includes(cleanQ));
    }
    if (field === 'member') {
      return r.members?.some((m) => cleanForFuzzy(m).includes(cleanQ));
    }
    if (field === 'unit') {
      return cleanForFuzzy(r.unit).includes(cleanQ);
    }
    if (field === 'note') {
      return cleanForFuzzy(r.note).includes(cleanQ);
    }

    // field === 'all': 全欄位多向模糊比對
    const matchFloor = isFloorMatch;
    const matchUnit = cleanForFuzzy(r.unit).includes(cleanQ);
    const matchMembers = r.members?.some((m) => cleanForFuzzy(m).includes(cleanQ));
    const matchPlates = r.plates?.some((p) => cleanForFuzzy(p).includes(cleanQ));
    const matchSlots = r.parkingSlots?.some((s) => cleanForFuzzy(s).includes(cleanQ));
    const matchNote = cleanForFuzzy(r.note).includes(cleanQ);

    return matchFloor || matchUnit || matchMembers || matchPlates || matchSlots || matchNote;
  });
};

// 格式化語音辨識文字（支援自動解析「樓層」、「車牌」、「車位」、「姓名」等指令）
export const formatSpeechText = (text) => {
  if (!text) return '';
  let formatted = text.trim();

  // 1. 移除語音前置贅詞
  formatted = formatted.replace(/^(請|幫我)?(查詢|搜尋|尋找|查一下|找一下|看一下|找)\s*/i, '');

  // 2. 轉換中文數字
  formatted = chineseNumberToArabic(formatted);

  // 3. 標準化地下車位（例如：地下一樓 -> B1、地下二樓 -> B2）
  formatted = formatted.replace(/地下([1-9])樓?/g, 'B$1');
  formatted = formatted.replace(/B\s*([1-9])/gi, 'B$1');

  // 4. 標準化樓層與房號（例如：12樓之1 -> 12F-1，12樓 -> 12F）
  formatted = formatted.replace(/(\d+)\s*樓之\s*(\d+)/g, '$1F-$2');
  formatted = formatted.replace(/(\d+)\s*樓/g, '$1F');

  // 5. 辨識欄位指令並加上標準查詢前綴
  const fieldMapping = [
    { regex: /^(樓層|樓高|樓)\s*[:：]?\s*(.*)$/i, prefix: '樓層: ' },
    { regex: /^(車牌號碼|車牌|車號)\s*[:：]?\s*(.*)$/i, prefix: '車牌: ' },
    { regex: /^(車位編號|車位|停車位)\s*[:：]?\s*(.*)$/i, prefix: '車位: ' },
    { regex: /^(住戶姓名|成員姓名|姓名|成員|住戶人名)\s*[:：]?\s*(.*)$/i, prefix: '姓名: ' },
    { regex: /^(住戶代號|住戶|戶號|房號)\s*[:：]?\s*(.*)$/i, prefix: '住戶: ' },
    { regex: /^(備註|附註)\s*[:：]?\s*(.*)$/i, prefix: '備註: ' },
  ];

  for (const item of fieldMapping) {
    const m = formatted.match(item.regex);
    if (m) {
      let rest = m[2].trim();
      if (item.prefix === '車牌: ') {
        rest = rest.toUpperCase().replace(/\s+/g, '');
        rest = rest.replace(/^([A-Z0-9]{2,4})([A-Z0-9]{3,4})$/, '$1-$2');
      } else if (item.prefix === '車位: ') {
        rest = rest.toUpperCase().replace(/\s+/g, '-');
      }
      return `${item.prefix}${rest}`;
    }
  }

  // 車牌格式美化（例如語音輸入 ABC 1234）
  formatted = formatted.replace(/^([A-Za-z]{2,4})\s*(\d{3,4})$/, (_, p1, p2) => `${p1.toUpperCase()}-${p2}`);

  return formatted;
};

// 解析 Excel 檔案（支援樓層、車位編號與車輛照片）
export const parseExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        const parsed = rawJson.map((row, idx) => {
          const unit = String(row['住戶代號'] || row['房號'] || row['住戶'] || `戶號-${idx + 1}`).trim();
          const floor = String(row['樓層'] || row['樓高'] || '').trim() || inferFloor(unit);

          const rawMembers = String(row['成員姓名'] || row['姓名'] || row['成員'] || '');
          const members = rawMembers ? rawMembers.split(/[,、/，\s]+/).filter(Boolean) : [];

          const rawPlates = String(row['車牌號碼'] || row['車牌'] || '');
          const plates = rawPlates ? rawPlates.split(/[,、/，\s]+/).map(p => p.toUpperCase().replace(/\s+/g, '')).filter(Boolean) : [];

          const rawSlots = String(row['車位編號'] || row['車位'] || '');
          const parkingSlots = rawSlots ? rawSlots.split(/[,、/，\s]+/).filter(Boolean) : [];

          const rawPhotos = String(row['車輛照片'] || row['照片'] || '');
          const carPhotos = rawPhotos.includes('data:image')
            ? rawPhotos.split(/[|]+/).filter(p => p.includes('data:image'))
            : [];

          const note = String(row['備註'] || '');

          return {
            id: `excel-${Date.now()}-${idx}`,
            unit,
            floor,
            members,
            plates,
            parkingSlots,
            carPhotos,
            note
          };
        });

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// 匯出 Excel 檔案（包含樓層）
export const exportToExcel = (residents) => {
  try {
    const exportData = residents.map((r) => {
      const photos = (r.carPhotos || []).filter(Boolean);
      let photoCol = '';
      if (photos.length > 0) {
        const joined = photos.join('|');
        if (joined.length <= 32000) {
          photoCol = joined;
        } else {
          photoCol = `已附照片 (${photos.length}張)`;
        }
      }

      return {
        '住戶代號': r.unit || '',
        '樓層': r.floor || inferFloor(r.unit),
        '成員姓名': (r.members || []).join('、'),
        '車牌號碼': (r.plates || []).join('、'),
        '車位編號': (r.parkingSlots || []).join('、'),
        '車輛照片': photoCol,
        '備註': r.note || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '住戶對照表');
    XLSX.writeFile(workbook, `住戶車輛對照表_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error('匯出失敗:', err);
    alert('匯出 Excel 失敗：' + (err.message || '未知錯誤'));
  }
};

// 完整備份所有資料（包含所有照片原始檔案，無字數限制）
export const exportBackupJson = (residents) => {
  try {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(residents, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `住戶完整備份(含照片)_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    alert('備份失敗：' + err.message);
  }
};

// 還原完整備份（含照片）
export const importBackupJson = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed)) {
          resolve(parsed);
        } else {
          reject(new Error('備份檔案格式不正確'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

// 下載 Excel 範本（加入樓層欄位）
export const downloadTemplate = () => {
  const templateData = [
    {
      '住戶代號': 'A棟-12F-1',
      '樓層': '12F',
      '成員姓名': '王大明、李美華',
      '車牌號碼': 'ABC-1234、XYZ-5678',
      '車位編號': 'B1-101、B1-102',
      '車輛照片': '',
      '備註': '管委會主委'
    },
    {
      '住戶代號': 'B棟-5F-2',
      '樓層': '5F',
      '成員姓名': '陳志豪',
      '車牌號碼': 'EFG-9988',
      '車位編號': 'B2-058',
      '車輛照片': '',
      '備註': '常態訪客請放行'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '住戶範本');
  XLSX.writeFile(workbook, '住戶車輛匯入範本.xlsx');
};
