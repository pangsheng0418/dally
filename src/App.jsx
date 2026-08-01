import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Mic, 
  FileSpreadsheet, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Download, 
  Upload, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  HelpCircle, 
  PlusCircle, 
  MinusCircle, 
  Building2, 
  Users, 
  CreditCard,
  FileText,
  RotateCcw
} from 'lucide-react';
import { initialResidents } from './mockData';
import { 
  filterResidents, 
  normalizeVoiceInput, 
  parseExcelFile, 
  exportToExcel, 
  downloadTemplate 
} from './utils';

export default function App() {
  // 狀態管理
  const [residents, setResidents] = useState(() => {
    try {
      const saved = localStorage.getItem('residents_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse residents data from localStorage', e);
    }
    return [];
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'add' | 'edit' | 'excel' | 'delete_confirm' | null
  const [selectedResident, setSelectedResident] = useState(null);
  const [alert, setAlert] = useState(null);
  
  // CRUD 表單狀態
  const [formId, setFormId] = useState('');
  const [formMembers, setFormMembers] = useState(['']);
  const [formPlates, setFormPlates] = useState(['']);
  const [formNotes, setFormNotes] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // Excel 拖曳狀態
  const [isDragging, setIsDragging] = useState(false);
  
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  // 儲存資料至 LocalStorage
  useEffect(() => {
    localStorage.setItem('residents_data', JSON.stringify(residents));
  }, [residents]);

  // 顯示通知
  const showAlert = (type, text) => {
    setAlert({ type, text });
    // 自動消失
    const timer = setTimeout(() => {
      setAlert(null);
    }, 4500);
    return () => clearTimeout(timer);
  };

  // 統計數據計算
  const totalResidents = residents.length;
  const totalMembers = residents.reduce((acc, curr) => acc + curr.members.length, 0);
  const totalPlates = residents.reduce((acc, curr) => acc + curr.licensePlates.length, 0);

  // 搜尋過濾後的資料
  const filteredData = filterResidents(residents, searchQuery);

  // 語音搜尋處理
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showAlert('error', '您的瀏覽器不支援語音辨識。建議使用 Google Chrome 瀏覽器！');
      return;
    }

    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      showAlert('info', '麥克風已啟動，請說出住戶代號（如：A棟十二樓之一）、成員姓名或車牌號碼...');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const formatted = normalizeVoiceInput(transcript);
      setSearchQuery(formatted);
      showAlert('success', `語音辨識成功！聽到：「${transcript}」 ➜ 搜尋關鍵字：「${formatted}」`);
    };

    recognition.onerror = (event) => {
      console.error('Speech error', event);
      if (event.error === 'not-allowed') {
        showAlert('error', '麥克風使用權限遭拒。請在瀏覽器網址列旁開啟麥克風權限。');
      } else {
        showAlert('error', `語音辨識出錯：${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };



  // 開啟編輯 Modal
  const openEditModal = (resident) => {
    setSelectedResident(resident);
    setFormId(resident.id);
    setFormMembers(resident.members.length > 0 ? [...resident.members] : ['']);
    setFormPlates(resident.licensePlates.length > 0 ? [...resident.licensePlates] : ['']);
    setFormNotes(resident.notes || '');
    setFormErrors({});
    setActiveModal('edit');
  };

  // 開啟刪除確認 Modal
  const openDeleteConfirm = (resident) => {
    setSelectedResident(resident);
    setActiveModal('delete_confirm');
  };

  // 處理 CRUD 表單動態欄位增減
  const handleAddMemberField = () => setFormMembers([...formMembers, '']);
  const handleRemoveMemberField = (index) => {
    const updated = formMembers.filter((_, i) => i !== index);
    setFormMembers(updated.length === 0 ? [''] : updated);
  };
  const handleMemberChange = (index, value) => {
    const updated = [...formMembers];
    updated[index] = value;
    setFormMembers(updated);
  };

  const handleAddPlateField = () => setFormPlates([...formPlates, '']);
  const handleRemovePlateField = (index) => {
    const updated = formPlates.filter((_, i) => i !== index);
    setFormPlates(updated.length === 0 ? [''] : updated);
  };
  const handlePlateChange = (index, value) => {
    const updated = [...formPlates];
    updated[index] = value.toUpperCase(); // 車牌號碼一律大寫
    setFormPlates(updated);
  };

  // 驗證並儲存住戶
  const handleSaveResident = (e) => {
    e.preventDefault();
    const errors = {};
    
    // 住戶代號必填與重複檢查
    const trimmedId = formId.trim();
    if (!trimmedId) {
      errors.id = '請輸入住戶代號';
    } else if (activeModal === 'add' && residents.some(r => r.id.toLowerCase() === trimmedId.toLowerCase())) {
      errors.id = '此住戶代號已存在系統中';
    }

    // 清理成員與車牌 (去空格與過濾空值)
    const cleanedMembers = formMembers.map(m => m.trim()).filter(Boolean);
    const cleanedPlates = formPlates.map(p => p.trim().toUpperCase()).filter(Boolean);

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newResident = {
      id: trimmedId,
      members: cleanedMembers,
      licensePlates: cleanedPlates,
      notes: formNotes.trim() || '無備註'
    };

    if (activeModal === 'add') {
      setResidents([newResident, ...residents]);
      showAlert('success', `已成功新增住戶：${trimmedId}`);
    } else {
      // 編輯模式
      const updated = residents.map(r => r.id === selectedResident.id ? newResident : r);
      setResidents(updated);
      showAlert('success', `已成功更新住戶：${trimmedId}`);
    }

    setActiveModal(null);
  };

  // 刪除住戶
  const handleDeleteResident = () => {
    if (!selectedResident) return;
    const updated = residents.filter(r => r.id !== selectedResident.id);
    setResidents(updated);
    showAlert('success', `已成功刪除住戶：${selectedResident.id}`);
    setActiveModal(null);
  };

  // Excel 拖曳匯入事件處理
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processImportFile(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processImportFile(file);
    }
  };

  // 處理匯入 Excel 檔案與資料合併
  const processImportFile = async (file) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (fileExtension !== 'xlsx' && fileExtension !== 'xls') {
      showAlert('error', '不支援的檔案格式，請上傳 .xlsx 或 .xls 檔案！');
      return;
    }

    try {
      showAlert('info', '正在解析 Excel 檔案...');
      const importedList = await parseExcelFile(file);
      
      const merged = [...residents];
      let addedCount = 0;
      let mergedCount = 0;

      importedList.forEach(imported => {
        const existingIdx = merged.findIndex(r => r.id.toLowerCase() === imported.id.toLowerCase());
        
        if (existingIdx > -1) {
          // 住戶已存在，進行合併與去重
          const existing = merged[existingIdx];
          
          // 合併成員
          const combinedMembers = Array.from(
            new Set([...existing.members, ...imported.members])
          );
          
          // 合併車牌
          const combinedPlates = Array.from(
            new Set([...existing.licensePlates, ...imported.licensePlates])
          );
          
          // 合併備註 (避開重複字串)
          let combinedNotes = existing.notes;
          if (imported.notes && imported.notes !== '無備註') {
            if (combinedNotes === '無備註' || !combinedNotes) {
              combinedNotes = imported.notes;
            } else if (!combinedNotes.toLowerCase().includes(imported.notes.toLowerCase())) {
              combinedNotes = `${combinedNotes}；${imported.notes}`;
            }
          }

          merged[existingIdx] = {
            ...existing,
            members: combinedMembers,
            licensePlates: combinedPlates,
            notes: combinedNotes
          };
          mergedCount++;
        } else {
          // 新增住戶
          merged.push(imported);
          addedCount++;
        }
      });

      setResidents(merged);
      showAlert('success', `Excel 匯入完成！成功新增 ${addedCount} 戶，合併更新 ${mergedCount} 戶。`);
      setActiveModal(null);
    } catch (err) {
      console.error(err);
      showAlert('error', `Excel 解析失敗，請確認檔案格式是否符合範本欄位規範。`);
    }
  };

  // 匯出 Excel
  const handleExport = () => {
    if (residents.length === 0) {
      showAlert('warning', '系統中目前無資料可匯出！');
      return;
    }
    try {
      exportToExcel(residents);
      showAlert('success', '已成功匯出大樓住戶車牌對照表 Excel。');
    } catch (err) {
      showAlert('error', '匯出失敗，請重試。');
    }
  };

  // 下載範本
  const handleDownloadTemplate = () => {
    try {
      downloadTemplate();
      showAlert('success', '已下載匯入範本，請依照表頭格式填寫後上傳。');
    } catch (err) {
      showAlert('error', '下載範本失敗。');
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 min-h-screen pb-20 font-sans antialiased">
      
      {/* Toast Alert 通知中心 */}
      {alert && (
        <div className="fixed top-6 right-6 z-50 transition-all duration-300 max-w-md w-full animate-bounce-short">
          <div className={`p-4 rounded-xl shadow-2xl backdrop-blur-md flex items-start gap-3 border ${
            alert.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200' :
            alert.type === 'error' ? 'bg-rose-950/80 border-rose-500/50 text-rose-200' :
            alert.type === 'info' ? 'bg-blue-950/80 border-blue-500/50 text-blue-200' :
            'bg-amber-950/80 border-amber-500/50 text-amber-200'
          }`}>
            <span className="mt-0.5">
              {alert.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
              {alert.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {alert.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
              {alert.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-400" />}
            </span>
            <div className="flex-1">
              <p className="font-semibold text-sm capitalize">{
                alert.type === 'success' ? '成功' :
                alert.type === 'error' ? '錯誤' :
                alert.type === 'info' ? '系統提示' : '警告'
              }</p>
              <p className="text-xs mt-1 text-slate-300">{alert.text}</p>
            </div>
            <button onClick={() => setAlert(null)} className="text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header 區 */}
      <header className="border-b border-slate-800 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-2xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                達麗宮廷 <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">車牌與住戶智慧管理</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">大樓住戶、成員姓名與車牌號碼三向交叉對照查詢系統</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveModal('clear_confirm')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-rose-950/30 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 text-sm font-semibold rounded-xl transition-all cursor-pointer"
              title="清除所有資料或還原為預設範例"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">清除與重設</span>
            </button>

            <button 
              onClick={() => setActiveModal('excel')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-sm font-semibold rounded-xl transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Excel 批次管理
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* 搜尋與語音控制區 */}
        <section className="max-w-3xl mx-auto mb-8">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-slate-400">
              <Search className="w-5 h-5" />
            </div>
            <input 
              type="text" 
              placeholder="搜尋車牌 (如 ABC-1234)、住戶代號 (如 A棟)、成員姓名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-28 py-3.5 bg-slate-900/60 hover:bg-slate-900/80 focus:bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-2xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-base shadow-inner"
            />
            
            <div className="absolute right-2 flex items-center gap-1.5">
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-all"
                  title="清除搜尋"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              
              <button 
                onClick={handleVoiceSearch}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  isRecording 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white pulse-animation' 
                    : 'bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-400 border border-indigo-500/30'
                }`}
                title={isRecording ? '停止錄音' : '語音搜尋'}
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 語音錄製中動態波形 */}
          {isRecording && (
            <div className="mt-3 flex items-center justify-center gap-2 p-3 bg-rose-950/30 border border-rose-900/40 rounded-xl animate-pulse">
              <span className="text-xs text-rose-300 font-semibold tracking-wider">正在聆聽語音...</span>
              <div className="flex items-end gap-0.5 h-4">
                <div className="w-0.75 bg-rose-400 rounded-full h-full wave-bar"></div>
                <div className="w-0.75 bg-rose-400 rounded-full h-full wave-bar"></div>
                <div className="w-0.75 bg-rose-400 rounded-full h-full wave-bar"></div>
                <div className="w-0.75 bg-rose-400 rounded-full h-full wave-bar"></div>
                <div className="w-0.75 bg-rose-400 rounded-full h-full wave-bar"></div>
              </div>
            </div>
          )}
        </section>

        {/* 快速統計面板 */}
        <section className="grid grid-cols-3 gap-4 mb-8">
          <div className="glass-effect p-4 rounded-2xl flex items-center justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all duration-500"></div>
            <div>
              <p className="text-xs text-slate-400 font-medium">住戶總數</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{totalResidents} <span className="text-xs text-slate-500 font-normal">戶</span></h3>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="glass-effect p-4 rounded-2xl flex items-center justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all duration-500"></div>
            <div>
              <p className="text-xs text-slate-400 font-medium">住戶成員</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{totalMembers} <span className="text-xs text-slate-500 font-normal">人</span></h3>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="glass-effect p-4 rounded-2xl flex items-center justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-sky-500/5 rounded-full blur-xl group-hover:bg-sky-500/10 transition-all duration-500"></div>
            <div>
              <p className="text-xs text-slate-400 font-medium">登記車牌</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{totalPlates} <span className="text-xs text-slate-500 font-normal">筆</span></h3>
            </div>
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* 搜尋結果標題 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-bold text-slate-300 flex items-center gap-2">
            住戶名單對照 
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-semibold">
              共符合 {filteredData.length} 筆
            </span>
          </h2>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              清除過濾條件
            </button>
          )}
        </div>

        {/* 住戶結果卡片列表 */}
        {filteredData.length > 0 ? (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredData.map((resident) => (
              <div 
                key={resident.id} 
                className="glass-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-lg"
              >
                <div>
                  {/* 住戶 ID 與操作選單 */}
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <span className="bg-indigo-500/10 text-indigo-300 text-sm font-bold px-3 py-1 rounded-xl border border-indigo-500/20 shadow-sm">
                      {resident.id}
                    </span>
                    
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEditModal(resident)}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/40 rounded-lg transition-all border border-transparent hover:border-indigo-500/20 cursor-pointer"
                        title="編輯住戶"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => openDeleteConfirm(resident)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-all border border-transparent hover:border-rose-500/20 cursor-pointer"
                        title="刪除住戶"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 成員列表 */}
                  <div className="mb-4">
                    <h4 className="text-xs text-slate-500 font-bold mb-2 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> 住戶成員
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {resident.members && resident.members.length > 0 ? (
                        resident.members.map((member, i) => (
                          <span 
                            key={i}
                            className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1 rounded-lg border border-slate-700/50 shadow-inner flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            {member}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600 italic">無登記成員</span>
                      )}
                    </div>
                  </div>

                  {/* 車牌列表 */}
                  <div className="mb-4">
                    <h4 className="text-xs text-slate-500 font-bold mb-2 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5" /> 登記車牌
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {resident.licensePlates && resident.licensePlates.length > 0 ? (
                        resident.licensePlates.map((plate, i) => (
                          <span 
                            key={i}
                            className="bg-slate-900 border-2 border-slate-700 text-slate-200 font-mono text-xs font-black tracking-wider px-2.5 py-1 rounded-md shadow-inner flex items-center gap-1 hover:border-indigo-500 hover:text-white transition-all cursor-default"
                          >
                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,1)]"></div>
                            {plate}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600 italic">無登記車牌</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 備註 */}
                <div className="mt-4 pt-3 border-t border-slate-800/60">
                  <div className="text-xs text-slate-500 font-bold mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> 備註說明
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed italic bg-slate-950/20 p-2 rounded-lg border border-slate-900/30">
                    {resident.notes || '無'}
                  </p>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="glass-effect p-12 text-center rounded-3xl max-w-lg mx-auto shadow-xl">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-300">查無相符資料</h3>
            <p className="text-xs text-slate-500 mt-2">請更換關鍵字重新搜尋，或點擊右上角「Excel 批次管理」匯入資料。</p>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold rounded-xl transition-all"
              >
                重設搜尋過濾
              </button>
            )}
          </section>
        )}
      </main>

      {/* CRUD 編輯 Modal */}
      {activeModal === 'edit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-zoom-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                編輯住戶資料：{selectedResident?.id}
              </h3>
              <button onClick={() => setActiveModal(null)} className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveResident} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              
              {/* 住戶代號 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  住戶代號 <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  disabled={activeModal === 'edit'}
                  placeholder="例如：A棟-12F-1、C棟-08F-2"
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  className={`w-full px-4 py-2.5 bg-slate-950 border rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                    formErrors.id ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800'
                  } ${activeModal === 'edit' ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                {formErrors.id && (
                  <p className="text-xs text-rose-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {formErrors.id}</p>
                )}
              </div>

              {/* 成員列表 (動態) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                    住戶成員姓名/稱謂
                  </label>
                  <button 
                    type="button"
                    onClick={handleAddMemberField}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> 新增成員
                  </button>
                </div>
                
                <div className="space-y-2">
                  {formMembers.map((member, index) => (
                    <div key={index} className="flex items-center gap-2 animate-slide-down">
                      <input 
                        type="text" 
                        placeholder={`成員姓名，如：張偉明 (屋主)、林淑芬 (太太)`}
                        value={member}
                        onChange={(e) => handleMemberChange(index, e.target.value)}
                        className="flex-1 px-4 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                      <button 
                        type="button"
                        onClick={() => handleRemoveMemberField(index)}
                        className="p-2 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                        title="移除成員"
                      >
                        <MinusCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 車牌列表 (動態) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                    登記車牌號碼
                  </label>
                  <button 
                    type="button"
                    onClick={handleAddPlateField}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> 新增車牌
                  </button>
                </div>
                
                <div className="space-y-2">
                  {formPlates.map((plate, index) => (
                    <div key={index} className="flex items-center gap-2 animate-slide-down">
                      <input 
                        type="text" 
                        placeholder="例如：ABC-1234 或 9988-ZZ"
                        value={plate}
                        onChange={(e) => handlePlateChange(index, e.target.value)}
                        className="flex-1 px-4 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono tracking-wider transition-all"
                      />
                      <button 
                        type="button"
                        onClick={() => handleRemovePlateField(index)}
                        className="p-2 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                        title="移除車牌"
                      >
                        <MinusCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 備註說明 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  備註與管理說明
                </label>
                <textarea 
                  placeholder="輸入車位編號、特殊交代或聯絡資訊..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows="3"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/10">
                <button 
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-all cursor-pointer"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  儲存
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Excel 批次管理 Modal */}
      {activeModal === 'excel' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-zoom-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                Excel 批次檔案管理
              </h3>
              <button onClick={() => setActiveModal(null)} className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              
              {/* 下載與說明區 */}
              <div className="p-4 bg-indigo-950/20 border border-indigo-500/25 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" /> 欄位與格式對照說明
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  匯入 Excel 必須符合以下欄位順序：
                  <br />
                  <span className="font-semibold text-indigo-200">1. 住戶代號</span> (必填) ➜ 
                  <span className="font-semibold text-indigo-200"> 2. 成員姓名/稱謂</span> ➜ 
                  <span className="font-semibold text-indigo-200"> 3. 車牌號碼</span> ➜ 
                  <span className="font-semibold text-indigo-200"> 4. 備註</span>
                  <br />
                  <span className="text-slate-400">※ 成員與車牌若有多筆，支援以逗號、分號或換行分隔。</span>
                </p>
                <div className="pt-1">
                  <button 
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 hover:border-indigo-500/60 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下載 Excel 格式範本
                  </button>
                </div>
              </div>

              {/* 拖曳上傳區 */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center group ${
                  isDragging 
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all duration-300 shadow-inner mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-bold text-slate-200">拖曳 Excel 檔案至此處，或點擊選取檔案</h4>
                <p className="text-xs text-slate-500 mt-1.5">支援格式：.xlsx, .xls</p>
              </div>

              {/* 資料備份匯出 */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex flex-col justify-center">
                  <h4 className="text-xs font-bold text-slate-400">備份與下載對照表</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">將目前系統中所有的住戶及車牌資訊匯出存檔為 Excel。</p>
                </div>
                
                <button 
                  onClick={handleExport}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all border border-emerald-500 hover:border-emerald-400 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  匯出完整 Excel
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {activeModal === 'delete_confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-zoom-in">
            {/* Modal Body */}
            <div className="p-6 text-center space-y-4">
              <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20 w-fit mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">確認刪除住戶？</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  您即將刪除住戶代號 <span className="font-bold text-indigo-400">"{selectedResident?.id}"</span> 的全部成員姓名與車牌號碼對照資料。此動作無法復原。
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/20 border-t border-slate-800/60 flex items-center justify-center gap-3">
              <button 
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                取消
              </button>
              <button 
                onClick={handleDeleteResident}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/20 hover:shadow-rose-600/30 transition-all cursor-pointer animate-pulse-once"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清除與重設確認 Modal */}
      {activeModal === 'clear_confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-zoom-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                資料清理與重設選項
              </h3>
              <button onClick={() => setActiveModal(null)} className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                請選擇您要執行的資料重設動作。此動作將會影響 LocalStorage 中的快取資料：
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setResidents(initialResidents);
                    showAlert('success', '已成功還原為預設範例資料！');
                    setActiveModal(null);
                  }}
                  className="w-full p-4 bg-indigo-950/20 hover:bg-indigo-950/40 border border-indigo-500/20 hover:border-indigo-500/40 text-left rounded-2xl transition-all group cursor-pointer"
                >
                  <div className="flex justify-between items-center bg-transparent">
                    <span className="text-sm font-bold text-indigo-300 group-hover:text-indigo-200">還原系統預設資料</span>
                    <RotateCcw className="w-4 h-4 text-indigo-400" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    將清除當前所有修改，並重新載入 6 筆系統內建的測試住戶與車牌對照資料。
                  </p>
                </button>

                <button
                  onClick={() => {
                    setResidents([]);
                    showAlert('success', '已成功清空系統所有住戶資料！');
                    setActiveModal(null);
                  }}
                  className="w-full p-4 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/20 hover:border-rose-500/40 text-left rounded-2xl transition-all group cursor-pointer"
                >
                  <div className="flex justify-between items-center bg-transparent">
                    <span className="text-sm font-bold text-rose-300 group-hover:text-rose-200">清空所有系統資料</span>
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    將系統清空為「完全空白」狀態。適用於管理員要從頭開始錄入或匯入全新真實資料。
                  </p>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/20 border-t border-slate-800/60 flex items-center justify-end">
              <button 
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                取消關閉
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
