import * as XLSX from 'xlsx';

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
    .replace(/[\s\-_棟樓之fF]/g, '');
};

// 支援住戶、成員、車牌、車位多向模糊搜尋
export const filterResidents = (residents, query) => {
  if (!query || !query.trim()) return residents;
  const cleanQ = cleanForFuzzy(query);

  return residents.filter((r) => {
    const matchUnit = cleanForFuzzy(r.unit).includes(cleanQ);
    const matchMembers = r.members?.some((m) => cleanForFuzzy(m).includes(cleanQ));
    const matchPlates = r.plates?.some((p) => cleanForFuzzy(p).includes(cleanQ));
    const matchSlots = r.parkingSlots?.some((s) => cleanForFuzzy(s).includes(cleanQ));
    const matchNote = cleanForFuzzy(r.note).includes(cleanQ);

    return matchUnit || matchMembers || matchPlates || matchSlots || matchNote;
  });
};

// 格式化語音辨識文字
export const formatSpeechText = (text) => {
  if (!text) return '';
  let formatted = text.trim();
  const digitMap = {
    '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
  };
  formatted = formatted.replace(/([一二兩三四五六七八九十]+)樓之([一二兩三四五六七八九十\d]+)/g, (match, p1, p2) => {
    let floor = digitMap[p1] || p1;
    let room = digitMap[p2] || p2;
    return `${floor}F-${room}`;
  });
  return formatted;
};

// 解析 Excel 檔案（支援車位編號與車輛照片）
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
          
          const rawMembers = String(row['成員姓名'] || row['姓名'] || row['成員'] || '');
          const members = rawMembers ? rawMembers.split(/[,、/，\s]+/).filter(Boolean) : [];

          const rawPlates = String(row['車牌號碼'] || row['車牌'] || '');
          const plates = rawPlates ? rawPlates.split(/[,、/，\s]+/).map(p => p.toUpperCase().replace(/\s+/g, '')).filter(Boolean) : [];

          const rawSlots = String(row['車位編號'] || row['車位'] || '');
          const parkingSlots = rawSlots ? rawSlots.split(/[,、/，\s]+/).filter(Boolean) : [];

          const rawPhotos = String(row['車輛照片'] || row['照片'] || '');
          // 只有當包含 base64 數據時才解析為照片，其餘文字標記（如「已附照片」）不解析
          const carPhotos = rawPhotos.includes('data:image')
            ? rawPhotos.split(/[|]+/).filter(p => p.includes('data:image'))
            : [];

          const note = String(row['備註'] || '');

          return {
            id: `excel-${Date.now()}-${idx}`,
            unit,
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

// 匯出 Excel 檔案（嚴格防止超過 Excel 32767 單一儲存格字元上限）
export const exportToExcel = (residents) => {
  try {
    const exportData = residents.map((r) => {
      const photos = (r.carPhotos || []).filter(Boolean);
      let photoCol = '';
      if (photos.length > 0) {
        const joined = photos.join('|');
        // Excel 單一儲存格上限為 32767 字元
        if (joined.length <= 32000) {
          photoCol = joined;
        } else {
          photoCol = `已附照片 (${photos.length}張)`;
        }
      }

      return {
        '住戶代號': r.unit || '',
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

// 下載 Excel 範本
export const downloadTemplate = () => {
  const templateData = [
    {
      '住戶代號': 'A棟-12F-1',
      '成員姓名': '王大明、李美華',
      '車牌號碼': 'ABC-1234、XYZ-5678',
      '車位編號': 'B1-101、B1-102',
      '車輛照片': '',
      '備註': '管委會主委'
    },
    {
      '住戶代號': 'B棟-5F-2',
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
