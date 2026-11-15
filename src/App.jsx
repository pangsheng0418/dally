import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Mic, MicOff, Car, Users, Building, Plus, Trash2, Edit3,
  Upload, Download, FileSpreadsheet, RotateCcw, AlertTriangle, Eye, X, Image as ImageIcon
} from 'lucide-react';
import { initialMockResidents } from './mockData';
import {
  filterResidents, formatSpeechText, parseExcelFile,
  exportToExcel, downloadTemplate, compressImage,
  exportBackupJson, importBackupJson
} from './utils';

export default function App() {
  const [residents, setResidents] = useState(() => {
    try {
      const saved = localStorage.getItem('dali_residents');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
        membersText: (resident.members || []).join('、'),
        vehicles,
        note: resident.note || ''
      });
    } else {
      setEditingResident({
        id: `resident-${Date.now()}`,
        unit: '',
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
              members: combinedMembers,
              plates: combinedPlates,
              parkingSlots: combinedSlots,
              carPhotos: combinedPhotos,
              note: [current.note, item.note].filter(Boolean).join('；')
            });
          } else {
            map.set(item.unit, item);
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
      setResidents(data);
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
          {/* 第一行：系統標題與字體大小切換選項 */}
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

      {/* 主體內容 */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 搜尋列與語音 */}
        <div className="relative flex items-center shadow-sm rounded-2xl bg-white border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
          <Search className="w-5 h-5 text-slate-400 ml-4 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋住戶、姓名、車牌、車位（支援模糊輸入，如 12F、B1-101）..."
            className="w-full px-3 py-4 text-slate-800 placeholder-slate-400 focus:outline-none text-lg font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-2 text-slate-400 hover:text-slate-600"
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
            title="語音辨識輸入"
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
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
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <Building className="w-5 h-5" />
                      </div>
                      <h2 className="font-black text-slate-900 text-xl tracking-tight">{r.unit}</h2>
                    </div>
                    <div className="flex items-center gap-1">
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
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">住戶代號 *</label>
                <input
                  type="text"
                  required
                  value={editingResident.unit}
                  onChange={(e) => setEditingResident({ ...editingResident, unit: e.target.value })}
                  placeholder="例如：A棟-12F-1"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                />
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
