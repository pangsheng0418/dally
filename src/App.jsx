import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Mic, MicOff, Car, Users, Building, Plus, Trash2, Edit3,
  Upload, Download, FileSpreadsheet, RotateCcw, AlertTriangle, Eye, X, Image as ImageIcon,
  Wifi, WifiOff, ShieldCheck
} from 'lucide-react';
import { initialMockResidents } from './mockData';
import {
  filterResidents, formatSpeechText, parseExcelFile,
  exportToExcel, downloadTemplate, compressImage,
  exportBackupJson, importBackupJson, inferFloor, parseFieldQuery
} from './utils';

export default function App() {
  const [residents, setResidents] = useState(() => {
    try {
      const saved = localStorage.getItem('dali_residents');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(r => ({
            ...r,
            floor: r.floor || inferFloor(r.unit)
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
    return initialMockResidents;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  // 字體大小等級：'normal' (16px), 'large' (18px), 'xlarge' (20.5px)
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('dali_font_size') || 'large';
  });

  useEffect(() => {
    document.documentElement.classList.remove('font-size-normal', 'font-size-large', 'font-size-xlarge');
    document.documentElement.classList.add(`font-size-${fontSize}`);
    localStorage.setItem('dali_font_size', fontSize);
  }, [fontSize]);

  // 編輯/新增 Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResident, setEditingResident] = useState(null);

  // 清除確認 Modal
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // 離線說明 Modal
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);

  // 實體網路連線狀態
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // 離線版本模式切換（儲存於 LocalStorage）
  const [isOfflineMode, setIsOfflineMode] = useState(() => {
    try {
      const saved = localStorage.getItem('dali_offline_mode');
      if (saved !== null) return saved === 'true';
    } catch (e) {
      console.error(e);
    }
    return false;
  });

  // 監聽網路連線變化
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 切換離線模式
  const toggleOfflineMode = (forcedValue = null) => {
    const nextVal = forcedValue !== null ? forcedValue : !isOfflineMode;
    setIsOfflineMode(nextVal);
    try {
      localStorage.setItem('dali_offline_mode', String(nextVal));
    } catch (e) {
      console.error(e);
    }
  };

  // 圖片大圖檢視 Modal
  const [viewingPhoto, setViewingPhoto] = useState(null);

  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // 儲存至 LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('dali_residents', JSON.stringify(residents));
    } catch (e) {
      console.warn('LocalStorage 儲存空間提醒：', e);
    }
  }, [residents]);

  // 初始化語音辨識
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = false;
      recog.interimResults = false;
      recog.lang = 'zh-TW';

      recog.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const formatted = formatSpeechText(transcript);
        setSearchQuery(formatted);
        setIsListening(false);
      };

      recog.onerror = () => setIsListening(false);
      recog.onend = () => setIsListening(false);

      recognitionRef.current = recog;
    } else {
      setSpeechSupported(false);
    }
  }, []);

  const toggleListening = () => {
    if (isOfflineMode || !isOnline) {
      alert('【離線版本提示】\n目前處於純本機離線模式（或無網際網路連線）。\n瀏覽器語音辨識服務需依賴網路雲端伺服器；請直接在搜尋框輸入關鍵字，住戶、車牌、車位與樓層皆可 100% 離線秒級搜尋！');
      return;
    }
    if (!speechSupported) {
      alert('您的瀏覽器不支援語音輸入功能。');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 開啟編輯/新增 Modal
  const openEditModal = (resident = null) => {
    if (resident) {
      const plates = resident.plates || [];
      const slots = resident.parkingSlots || [];
      const photos = resident.carPhotos || [];

      // 依車輛數量組合車輛陣列
      const count = Math.max(plates.length, slots.length, photos.length, 1);
      const vehicles = [];
      for (let i = 0; i < count; i++) {
        vehicles.push({
          plate: plates[i] || '',
          slot: slots[i] || '',
          photo: photos[i] || ''
        });
      }

      setEditingResident({
        ...resident,
        floor: resident.floor || inferFloor(resident.unit),
        membersText: (resident.members || []).join('、'),
        vehicles,
        note: resident.note || ''
      });
    } else {
      setEditingResident({
        id: `resident-${Date.now()}`,
        unit: '',
        floor: '',
        membersText: '',
        vehicles: [{ plate: '', slot: '', photo: '' }],
        note: ''
      });
    }
    setIsModalOpen(true);
  };

  // 儲存住戶
  const handleSaveResident = (e) => {
    e.preventDefault();
    if (!editingResident.unit.trim()) {
      alert('請填寫住戶代號');
      return;
    }

    const members = editingResident.membersText
      .split(/[,、/，\s]+/)
      .map(m => m.trim())
      .filter(Boolean);

    const validVehicles = editingResident.vehicles.filter(v => v.plate.trim() || v.slot.trim() || v.photo);
    const plates = validVehicles.map(v => v.plate.trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean);
    const parkingSlots = validVehicles.map(v => v.slot.trim());
    const carPhotos = validVehicles.map(v => v.photo || '');

    const updated = {
      id: editingResident.id,
      unit: editingResident.unit.trim(),
      floor: editingResident.floor?.trim() || inferFloor(editingResident.unit),
      members,
      plates,
      parkingSlots,
      carPhotos,
      note: editingResident.note.trim()
    };

    setResidents(prev => {
      const exists = prev.some(r => r.id === updated.id);
      if (exists) {
        return prev.map(r => r.id === updated.id ? updated : r);
      }
      return [updated, ...prev];
    });

    setIsModalOpen(false);
  };

  // 刪除住戶
  const handleDeleteResident = (id) => {
    if (window.confirm('確定要刪除此筆住戶資料嗎？')) {
      setResidents(prev => prev.filter(r => r.id !== id));
    }
  };

  // 車輛照片上傳處理
  const handlePhotoUpload = async (index, file) => {
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setEditingResident(prev => {
        const nextVehicles = [...prev.vehicles];
        nextVehicles[index] = { ...nextVehicles[index], photo: base64 };
        return { ...prev, vehicles: nextVehicles };
      });
    } catch (err) {
      alert('圖片處理失敗，請重試');
    }
  };

  // Excel 匯入
  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        alert('未在 Excel 檔案中讀取到資料');
        return;
      }
      setResidents(prev => {
        const map = new Map(prev.map(r => [r.unit, { ...r }]));
        parsed.forEach(item => {
          if (map.has(item.unit)) {
            const current = map.get(item.unit);
            const combinedMembers = Array.from(new Set([...current.members, ...item.members]));
            const combinedPlates = Array.from(new Set([...current.plates, ...item.plates]));
            const combinedSlots = Array.from(new Set([...(current.parkingSlots || []), ...(item.parkingSlots || [])]));
            const combinedPhotos = item.carPhotos && item.carPhotos.length > 0
              ? item.carPhotos
              : (current.carPhotos || []);
            map.set(item.unit, {
              ...current,
              floor: item.floor || current.floor || inferFloor(item.unit),
              members: combinedMembers,
              plates: combinedPlates,
              parkingSlots: combinedSlots,
              carPhotos: combinedPhotos,
              note: [current.note, item.note].filter(Boolean).join('；')
            });
          } else {
            map.set(item.unit, {
              ...item,
              floor: item.floor || inferFloor(item.unit)
            });
          }
        });
        return Array.from(map.values());
      });
      alert(`成功匯入 ${parsed.length} 筆資料！`);
    } catch (err) {
      alert('Excel 匯入失敗，請確認檔案格式是否正確');
    }
    e.target.value = '';
  };

  // 還原完整備份（含照片）
  const handleBackupImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await importBackupJson(file);
      const withFloor = data.map(r => ({
        ...r,
        floor: r.floor || inferFloor(r.unit)
      }));
      setResidents(withFloor);
      alert(`成功還原 ${data.length} 筆住戶完整資料（含所有照片）！`);
      setIsClearModalOpen(false);
    } catch (err) {
      alert('還原備份失敗：' + err.message);
    }
    e.target.value = '';
  };

  const filteredResidents = filterResidents(residents, searchQuery);

  const totalVehicles = residents.reduce((acc, r) => acc + (r.plates ? r.plates.length : 0), 0);
  const totalPhotos = residents.reduce((acc, r) => acc + (r.carPhotos ? r.carPhotos.filter(Boolean).length : 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* 頂部導航：分為兩行，解決手機顯示過長與擁擠問題 */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-2.5 space-y-2.5">
          {/* 第一行：系統標題、離線模式切換與字體大小選項 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <Car className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                  住戶管理
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  車牌、車位與照片智慧對照系統
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 離線/連線版本切換開關 */}
              <button
                type="button"
                onClick={() => toggleOfflineMode()}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black rounded-xl border transition shadow-2xs ${
                  isOfflineMode
                    ? 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20'
                    : isOnline
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-rose-50 text-rose-700 border-rose-300'
                }`}
                title={isOfflineMode ? '目前處於純本機離線模式（點擊可切換回連線模式）' : '目前處於連線模式（點擊可切換為離線版本）'}
              >
                {isOfflineMode ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>離線版</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    <span>連線版</span>
                  </>
                )}
              </button>

              {/* 字體大小切換選項 */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                <span className="text-xs text-slate-500 font-bold px-1.5 hidden sm:inline">字體:</span>
                <button
                  type="button"
                  onClick={() => setFontSize('normal')}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition ${
                    fontSize === 'normal'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="標準字體 (16px)"
                >
                  標準
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize('large')}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition ${
                    fontSize === 'large'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="放大字體 (18px，預設)"
                >
                  放大
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize('xlarge')}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition ${
                    fontSize === 'xlarge'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="特大字體 (20.5px)"
                >
                  特大
                </button>
              </div>
            </div>
          </div>

          {/* 第二行：快捷操作功能列 */}
          <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => openEditModal()}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>新增住戶</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
              title="匯入 Excel"
            >
              <Upload className="w-4 h-4" />
              <span>匯入</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleExcelImport}
              accept=".xlsx,.xls"
              className="hidden"
            />

            <button
              onClick={() => exportToExcel(residents)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-sm font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              title="匯出 Excel"
            >
              <Download className="w-4 h-4" />
              <span>匯出</span>
            </button>

            <button
              onClick={() => setIsClearModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:py-2 text-sm font-bold rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition shrink-0"
              title="重設/清空"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">重設</span>
            </button>
          </div>
        </div>
      </header>

      {/* 離線版本橫幅提示 */}
      {isOfflineMode && (
        <div className="bg-amber-500 text-white px-4 py-2 text-xs sm:text-sm font-bold shadow-xs">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="truncate">
                ⚡ <b>已切換為純本機離線版本</b>：所有住戶、車牌資料保存在本機瀏覽器，無須網路即可完全正常查詢與管理！
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsOfflineModalOpen(true)}
                className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded-lg text-xs font-bold transition"
              >
                離線說明
              </button>
              <button
                type="button"
                onClick={() => toggleOfflineMode(false)}
                className="bg-white text-amber-800 hover:bg-amber-100 px-2.5 py-0.5 rounded-lg text-xs font-bold transition shadow-xs"
              >
                返回連線版
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主體內容 */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 搜尋列與語音（支援針對各欄位查詢） */}
        <div className="space-y-2.5">
          <div className="relative flex items-center shadow-sm rounded-2xl bg-white border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            <Search className="w-5 h-5 text-slate-400 ml-4 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋或語音：可說「樓層 12樓」、「車牌 5678」、「車位 B1」或「姓名 王大明」..."
              className="w-full px-3 py-4 text-slate-800 placeholder-slate-400 focus:outline-none text-lg font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-2 text-slate-400 hover:text-slate-600"
                title="清除搜尋"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={toggleListening}
              className={`mr-2 p-3 rounded-xl transition ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
              title={isListening ? '點擊結束語音辨識' : '點擊開始語音辨識（支援各欄位語音搜尋）'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>

          {/* 語音聆聽即時提示 */}
          {isListening && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold animate-pulse">
              <Mic className="w-4 h-4 shrink-0 text-rose-500" />
              <span>正在聆聽中... 請說出查詢內容，例如：<b>「樓層 12樓」</b>、<b>「車牌 ABC-1234」</b>、<b>「車位 B1」</b> 或 <b>「姓名 王大明」</b></span>
            </div>
          )}

          {/* 各欄位快選篩選標籤 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-500 font-bold shrink-0 mr-1">欄位篩選:</span>
            {[
              { label: '全部欄位', prefix: '', key: 'all' },
              { label: '樓層', prefix: '樓層: ', key: 'floor' },
              { label: '車牌', prefix: '車牌: ', key: 'plate' },
              { label: '車位', prefix: '車位: ', key: 'slot' },
              { label: '姓名', prefix: '姓名: ', key: 'member' },
              { label: '住戶代號', prefix: '住戶: ', key: 'unit' },
              { label: '備註', prefix: '備註: ', key: 'note' }
            ].map(tab => {
              const parsed = parseFieldQuery(searchQuery);
              const isActive = tab.key === 'all'
                ? parsed.field === 'all' && !searchQuery.match(/^(樓層|車牌|車位|姓名|成員|住戶|戶號|房號|備註)[:：\s]/)
                : parsed.field === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (tab.key === 'all') {
                      setSearchQuery(parsed.keyword);
                    } else {
                      setSearchQuery(`${tab.prefix}${parsed.keyword}`);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 統計與快捷操作 */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 px-1">
          <div className="flex items-center gap-4">
            <span>住戶：<b className="text-slate-900 font-bold text-base">{residents.length}</b> 戶</span>
            <span>登記車輛：<b className="text-blue-600 font-bold text-base">{totalVehicles}</b> 輛</span>
            <span>車輛照片：<b className="text-emerald-600 font-bold text-base">{totalPhotos}</b> 張</span>
          </div>
          <button
            onClick={downloadTemplate}
            className="text-blue-600 hover:underline flex items-center gap-1.5 font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            下載 Excel 範本
          </button>
        </div>

        {/* 住戶列表 */}
        {filteredResidents.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-base">沒有找到相符的住戶或車輛資料</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResidents.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* 住戶標題與操作 */}
                  <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                        <Building className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-black text-slate-900 text-xl tracking-tight">{r.unit}</h2>
                          {(r.floor || inferFloor(r.unit)) && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black shrink-0">
                              {r.floor || inferFloor(r.unit)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(r)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="編輯"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteResident(r.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 成員列表 */}
                  <div className="mt-3 flex items-center gap-2 text-base text-slate-700 font-medium">
                    <Users className="w-5 h-5 text-slate-400 shrink-0" />
                    <span>{r.members?.length ? r.members.join('、') : '未登記成員'}</span>
                  </div>

                  {/* 車輛資訊卡片（含車牌、車位與照片縮圖） */}
                  <div className="mt-4 space-y-2.5">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      登記車輛與車位
                    </p>
                    {(!r.plates || r.plates.length === 0) ? (
                      <p className="text-sm text-slate-400 italic">無登記車輛</p>
                    ) : (
                      r.plates.map((plate, pIdx) => {
                        const slot = r.parkingSlots?.[pIdx];
                        const photo = r.carPhotos?.[pIdx];
                        return (
                          <div
                            key={pIdx}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                          >
                            <div className="flex items-center gap-3">
                              {photo ? (
                                <img
                                  src={photo}
                                  alt="車輛照片"
                                  onClick={() => setViewingPhoto(photo)}
                                  className="w-12 h-12 object-cover rounded-xl cursor-pointer hover:opacity-80 transition border border-slate-200"
                                  title="點擊放大檢視"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400">
                                  <ImageIcon className="w-6 h-6" />
                                </div>
                              )}
                              <div>
                                <span className="font-mono font-black text-slate-900 text-lg sm:text-xl tracking-wider">
                                  {plate}
                                </span>
                                {slot && (
                                  <span className="block text-sm text-blue-600 font-bold mt-0.5">
                                    車位: {slot}
                                  </span>
                                )}
                              </div>
                            </div>
                            {photo && (
                              <button
                                onClick={() => setViewingPhoto(photo)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 transition"
                                title="查看大圖"
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 備註 */}
                {r.note && (
                  <div className="mt-4 pt-3 border-t border-slate-100 text-sm text-slate-600 font-medium">
                    備註：{r.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 編輯/新增住戶 Modal */}
      {isModalOpen && editingResident && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-xl text-slate-900">
                {residents.some(r => r.id === editingResident.id) ? '編輯住戶資料' : '新增住戶資料'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResident} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">住戶代號 *</label>
                  <input
                    type="text"
                    required
                    value={editingResident.unit}
                    onChange={(e) => {
                      const unitVal = e.target.value;
                      const next = { ...editingResident, unit: unitVal };
                      if (!editingResident.floor) {
                        next.floor = inferFloor(unitVal);
                      }
                      setEditingResident(next);
                    }}
                    placeholder="例如：A棟-12F-1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">所屬樓層</label>
                  <input
                    type="text"
                    value={editingResident.floor || ''}
                    onChange={(e) => setEditingResident({ ...editingResident, floor: e.target.value })}
                    placeholder="例如：12F 或 12樓"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">成員姓名（以頓號、逗號隔開）</label>
                <input
                  type="text"
                  value={editingResident.membersText}
                  onChange={(e) => setEditingResident({ ...editingResident, membersText: e.target.value })}
                  placeholder="例如：王大明、李美華"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                />
              </div>

              {/* 車輛、車位與照片清單 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-slate-700">登記車輛清單</label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingResident({
                        ...editingResident,
                        vehicles: [...editingResident.vehicles, { plate: '', slot: '', photo: '' }]
                      });
                    }}
                    className="text-sm text-blue-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> 增加一輛車
                  </button>
                </div>

                <div className="space-y-3">
                  {editingResident.vehicles.map((v, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-sm font-bold text-slate-600">
                        <span>車輛 #{idx + 1}</span>
                        {editingResident.vehicles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = editingResident.vehicles.filter((_, i) => i !== idx);
                              setEditingResident({ ...editingResident, vehicles: next });
                            }}
                            className="text-rose-500 hover:underline text-xs"
                          >
                            移除此車
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="車牌 (如 ABC-1234)"
                          value={v.plate}
                          onChange={(e) => {
                            const next = [...editingResident.vehicles];
                            next[idx] = { ...next[idx], plate: e.target.value };
                            setEditingResident({ ...editingResident, vehicles: next });
                          }}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-base focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          placeholder="車位編號 (如 B1-101)"
                          value={v.slot}
                          onChange={(e) => {
                            const next = [...editingResident.vehicles];
                            next[idx] = { ...next[idx], slot: e.target.value };
                            setEditingResident({ ...editingResident, vehicles: next });
                          }}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-base focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {/* 上傳照片區 */}
                      <div className="flex items-center gap-3 pt-1">
                        {v.photo ? (
                          <div className="relative">
                            <img
                              src={v.photo}
                              alt="車輛照片"
                              className="w-14 h-14 object-cover rounded-lg border border-slate-300"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...editingResident.vehicles];
                                next[idx] = { ...next[idx], photo: '' };
                                setEditingResident({ ...editingResident, vehicles: next });
                              }}
                              className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 shadow"
                              title="移除照片"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition shadow-sm">
                            <Upload className="w-3.5 h-3.5" /> 上傳車輛照片
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handlePhotoUpload(idx, e.target.files[0])}
                            />
                          </label>
                        )}
                        <span className="text-xs text-slate-400">
                          {v.photo ? '已上傳（自動壓縮保存）' : '可上傳此車外觀照片'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">備註</label>
                <textarea
                  value={editingResident.note}
                  onChange={(e) => setEditingResident({ ...editingResident, note: e.target.value })}
                  placeholder="備註資訊..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-sm"
                >
                  儲存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 清除/重設 Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-slate-900">資料管理選項</h3>
            </div>
            <p className="text-sm text-slate-500">
              請選擇您希望進行的資料操作方式：
            </p>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => exportBackupJson(residents)}
                className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition text-left flex items-center justify-between"
              >
                <span>完整備份所有資料 (含全部照片 JSON)</span>
                <Download className="w-4 h-4 text-blue-500" />
              </button>
              <button
                onClick={() => backupInputRef.current?.click()}
                className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition text-left flex items-center justify-between"
              >
                <span>匯入還原完整備份 (JSON 檔)</span>
                <Upload className="w-4 h-4 text-emerald-500" />
              </button>
              <input
                type="file"
                ref={backupInputRef}
                onChange={handleBackupImport}
                accept=".json"
                className="hidden"
              />
              <button
                onClick={() => {
                  setResidents(initialMockResidents);
                  setIsClearModalOpen(false);
                }}
                className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition text-left flex items-center justify-between"
              >
                <span>還原預設測試資料 (6 筆)</span>
                <RotateCcw className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={() => {
                  setResidents([]);
                  setIsClearModalOpen(false);
                }}
                className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition text-left flex items-center justify-between"
              >
                <span>清空所有資料（空白重匯）</span>
                <Trash2 className="w-4 h-4 text-rose-500" />
              </button>
            </div>
            <button
              onClick={() => setIsClearModalOpen(false)}
              className="w-full mt-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 離線版本說明與設定 Modal */}
      {isOfflineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl text-white ${isOfflineMode ? 'bg-amber-500' : 'bg-blue-600'}`}>
                  {isOfflineMode ? <WifiOff className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">離線版本模式說明</h3>
                  <p className="text-xs text-slate-500">無網路環境純本機獨立運作指南</p>
                </div>
              </div>
              <button
                onClick={() => setIsOfflineModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 目前狀態卡片 */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">系統運作模式：</span>
                <span className={`font-black px-2.5 py-0.5 rounded-md text-xs ${
                  isOfflineMode
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {isOfflineMode ? '🟡 離線版本 (純本機零網路)' : '🟢 連線版本 (正常)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">實體網路狀態：</span>
                <span className="font-bold text-slate-700">
                  {isOnline ? '已連上網際網路' : '未偵測到網路連線（離線狀態）'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">本機資料庫 (LocalStorage)：</span>
                <span className="font-bold text-blue-600">正常運作（已儲存 {residents.length} 戶）</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">離線快取 (Service Worker)：</span>
                <span className="font-bold text-emerald-600">已啟用（斷網仍可直接開啟網頁）</span>
              </div>
            </div>

            {/* 離線功能支援清單 */}
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                各功能離線支援度對照
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">功能項目</th>
                      <th className="p-2">離線狀態</th>
                      <th className="p-2">運作說明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    <tr>
                      <td className="p-2 font-bold text-slate-800">住戶與車牌查詢</td>
                      <td className="p-2 font-bold text-emerald-600">100% 正常</td>
                      <td className="p-2">本機秒級模糊比對，不耗流量</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-slate-800">樓層與欄位篩選</td>
                      <td className="p-2 font-bold text-emerald-600">100% 正常</td>
                      <td className="p-2">本機即時分類過濾</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-slate-800">新增／編輯／刪除</td>
                      <td className="p-2 font-bold text-emerald-600">100% 正常</td>
                      <td className="p-2">直接保存至瀏覽器本機空間</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-slate-800">車輛照片管理</td>
                      <td className="p-2 font-bold text-emerald-600">100% 正常</td>
                      <td className="p-2">自動壓縮並於本機離線保存</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-slate-800">Excel 匯入／匯出</td>
                      <td className="p-2 font-bold text-emerald-600">100% 正常</td>
                      <td className="p-2">純瀏覽器端離線生成與解析</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-slate-800">JSON 完整備份還原</td>
                      <td className="p-2 font-bold text-emerald-600">100% 正常</td>
                      <td className="p-2">隨時存入隨身碟帶至其他電腦</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-slate-800">語音輸入辨識</td>
                      <td className="p-2 font-bold text-amber-600">需網路連線</td>
                      <td className="p-2">離線時請改用鍵盤文字搜尋</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 操作按鈕群 */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  toggleOfflineMode();
                  setIsOfflineModalOpen(false);
                }}
                className={`w-full py-2.5 px-4 text-sm font-bold rounded-xl transition text-center flex items-center justify-center gap-2 ${
                  isOfflineMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                    : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                }`}
              >
                {isOfflineMode ? (
                  <>
                    <Wifi className="w-4 h-4" />
                    <span>切換返回「連線模式」</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4" />
                    <span>切換啟用「純本機離線模式」</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  exportBackupJson(residents);
                }}
                className="w-full py-2 px-4 text-sm font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition text-center flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>匯出離線備份檔案 (JSON 檔，可隨身攜帶)</span>
              </button>
            </div>

            <button
              onClick={() => setIsOfflineModalOpen(false)}
              className="w-full py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              關閉視窗
            </button>
          </div>
        </div>
      )}

      {/* 圖片大圖檢視 Modal */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingPhoto(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewingPhoto(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-200 p-1"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={viewingPhoto}
              alt="車輛大圖"
              className="w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
