
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, RefreshCw, Send, CheckCircle, Clock, File as FileIcon, Search, AlertTriangle, RotateCcw, Zap, Settings, X, CalendarClock, Timer } from 'lucide-react';
import { AppState, Recipient, FileEntry, AutoScanConfig } from './types';
import { CsvUploader } from './components/CsvUploader';
import { generateEmailContent, findKeywordMatch } from './services/geminiService';

const LOGO_URL = "https://1drv.ms/i/c/9001c56eb955c86d/IQR6eojwjvGgSYkp266gHvyqAawCgXODNSK6ct0fNeb6GVQ";

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD_CSV);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  
  // Auto Scan State
  const [scanConfig, setScanConfig] = useState<AutoScanConfig>({ mode: 'disabled', intervalMinutes: 30 });
  const [showSettings, setShowSettings] = useState(false);
  const lastAutoScanRef = useRef<number>(0); // Timestamp of last successful auto-scan execution

  // 1. Handle CSV Load
  const handleCsvLoaded = (data: Recipient[]) => {
    setRecipients(data);
    setAppState(AppState.SELECT_FOLDER);
  };

  // 2. Handle Folder Selection
  const handleSelectFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      setAppState(AppState.DASHBOARD);
      // Trigger initial scan
      await scanDirectory(handle);
    } catch (err) {
      console.error("Folder access denied or cancelled", err);
    }
  };

  // 3. Scan Logic
  const scanDirectory = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setIsScanning(true);
    const newFiles: FileEntry[] = [];
    
    try {
      // Iterate through directory
      // @ts-ignore - TypeScript lib might accept AsyncIterable, but define explicitly if needed
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          newFiles.push({ name: entry.name, handle: entry as FileSystemFileHandle });
        }
      }
      setFiles(newFiles);
      setLastScanTime(new Date());
    } catch (e) {
      console.error("Error scanning directory", e);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // 4. Auto-Scan Heartbeat
  useEffect(() => {
    if (!dirHandle || scanConfig.mode === 'disabled') return;

    const checkAutoScan = () => {
      if (isScanning) return;
      const now = new Date();
      const currentTimestamp = now.getTime();
      
      // Prevent double scanning in the same minute for fixed time, or rapid fire
      if (currentTimestamp - lastAutoScanRef.current < 60000) return;

      let shouldScan = false;

      if (scanConfig.mode === 'interval') {
        const lastRun = lastScanTime ? lastScanTime.getTime() : 0;
        const diffMinutes = (currentTimestamp - lastRun) / 60000;
        if (diffMinutes >= scanConfig.intervalMinutes) {
          shouldScan = true;
        }
      } else if (scanConfig.mode === 'fixed') {
        // 08:00, 12:00, 16:00
        const hour = now.getHours();
        const minute = now.getMinutes();
        const targetHours = [8, 12, 16];
        
        // Check if we are in the target hour and within the first minute
        if (targetHours.includes(hour) && minute === 0) {
          shouldScan = true;
        }
      }

      if (shouldScan) {
        lastAutoScanRef.current = currentTimestamp;
        scanDirectory(dirHandle);
      }
    };

    // Heartbeat every 10 seconds to check time
    const intervalId = setInterval(checkAutoScan, 10000);
    return () => clearInterval(intervalId);
  }, [dirHandle, scanConfig, lastScanTime, isScanning, scanDirectory]);


  // 5. Matching Logic (Triggered when files or recipients change)
  useEffect(() => {
    if (files.length === 0 || recipients.length === 0) return;

    const processMatches = async () => {
      const updatedRecipients = [...recipients];
      let hasChanges = false;
      const fileNames = files.map(f => f.name);

      for (let i = 0; i < updatedRecipients.length; i++) {
        const r = updatedRecipients[i];
        
        // Skip if already matched and file still exists
        if (r.status !== 'pending' && r.matchedFileName && fileNames.includes(r.matchedFileName)) {
            continue;
        }

        // --- UPDATED STRICT LOGIC ---
        // Pass both Name and Agency to the strict matcher
        const strictMatch = findKeywordMatch(r.name, r.agency, fileNames);
        
        if (strictMatch) {
            updatedRecipients[i] = { ...r, status: 'file_found', matchedFileName: strictMatch };
            hasChanges = true;
            continue;
        }
      }

      if (hasChanges) {
        setRecipients(updatedRecipients);
      }
    };

    processMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]); 

  // 6. Generate Email Content (Triggered when a file is found but content not generated)
  useEffect(() => {
    const generateContent = async () => {
      const targets = recipients.filter(r => r.status === 'file_found' && !r.emailBody);
      
      if (targets.length === 0) return;

      const updatedRecipients = [...recipients];
      
      await Promise.all(targets.map(async (target) => {
        const index = updatedRecipients.findIndex(r => r.id === target.id);
        if (index === -1) return;

        const content = await generateEmailContent(target.name, target.agency, target.matchedFileName!);
        updatedRecipients[index] = {
            ...updatedRecipients[index],
            emailSubject: content.subject,
            emailBody: content.body,
            status: 'ready'
        };
      }));

      setRecipients(updatedRecipients);
    };

    generateContent();
  }, [recipients]);


  // Helper: Open Mail Client
  const handleSend = (recipient: Recipient) => {
    if (!recipient.emailBody || !recipient.emailSubject) return;

    const subject = encodeURIComponent(recipient.emailSubject);
    const body = encodeURIComponent(recipient.emailBody);
    const cc = "suporte-gerencial@petacorp.com.br,financeiro@petacorp.com.br";
    
    window.open(`mailto:${recipient.email}?cc=${cc}&subject=${subject}&body=${body}`, '_blank');
    
    // Update status to sent locally
    setRecipients(prev => prev.map(r => r.id === recipient.id ? { ...r, status: 'sent' } : r));
  };

  // Helper: Send All Ready
  const handleSendAll = () => {
    const readyRecipients = recipients.filter(r => r.status === 'ready');
    if (readyRecipients.length === 0) return;

    const confirmed = window.confirm(`Isso tentará abrir ${readyRecipients.length} janelas de e-mail. Seu navegador pode bloquear pop-ups. Deseja continuar?`);
    if (!confirmed) return;

    readyRecipients.forEach(r => {
        handleSend(r);
    });
  };

  // Helper: Reset Status
  const handleResetStatus = (recipient: Recipient) => {
    setRecipients(prev => prev.map(r => {
        if (r.id !== recipient.id) return r;
        
        // If file still exists, go to ready, otherwise pending
        const fileExists = files.some(f => f.name === r.matchedFileName);
        return {
            ...r,
            status: fileExists ? 'ready' : 'pending'
        };
    }));
  };

  // Render Functions
  if (appState === AppState.UPLOAD_CSV) {
    return <CsvUploader onDataLoaded={handleCsvLoaded} />;
  }

  if (appState === AppState.SELECT_FOLDER) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white p-12 rounded-2xl shadow-xl text-center max-w-2xl w-full">
          <div className="flex justify-center mb-6">
            <img src={LOGO_URL} alt="Petacorp Logo" className="h-12 object-contain" />
          </div>
          <div className="bg-indigo-50 p-6 rounded-full inline-block mb-6">
            <FolderOpen className="w-16 h-16 text-indigo-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Selecionar Pasta Monitorada</h2>
          <p className="text-gray-600 mb-6">
            Escolha a pasta onde os anexos (PDFs, Docs) estão salvos.
          </p>
          
          <button 
            onClick={handleSelectFolder}
            className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition shadow-lg hover:shadow-xl flex items-center gap-3 mx-auto w-full justify-center sm:w-auto"
          >
            <FolderOpen className="w-5 h-5" />
            Escolher Pasta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                Configurar Varredura Automática
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Mode Selection */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => setScanConfig({ ...scanConfig, mode: 'disabled' })}
                  className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${scanConfig.mode === 'disabled' ? 'bg-gray-100 border-gray-400 ring-1 ring-gray-400' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${scanConfig.mode === 'disabled' ? 'border-gray-600' : 'border-gray-300'}`}>
                    {scanConfig.mode === 'disabled' && <div className="w-2 h-2 rounded-full bg-gray-600" />}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Manual</span>
                    <p className="text-xs text-gray-500">Apenas quando clicar em atualizar</p>
                  </div>
                </button>

                <button
                  onClick={() => setScanConfig({ ...scanConfig, mode: 'interval' })}
                  className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${scanConfig.mode === 'interval' ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${scanConfig.mode === 'interval' ? 'border-blue-600' : 'border-gray-300'}`}>
                    {scanConfig.mode === 'interval' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-700">Intervalos Regulares</span>
                    </div>
                    {scanConfig.mode === 'interval' && (
                        <div className="mt-2 flex items-center gap-2">
                             <select 
                                value={scanConfig.intervalMinutes}
                                onChange={(e) => setScanConfig({ ...scanConfig, intervalMinutes: Number(e.target.value) })}
                                className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-1 bg-white border"
                                onClick={(e) => e.stopPropagation()}
                             >
                                <option value={5}>5 minutos</option>
                                <option value={10}>10 minutos</option>
                                <option value={15}>15 minutos</option>
                                <option value={30}>30 minutos</option>
                                <option value={60}>1 hora</option>
                             </select>
                        </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => setScanConfig({ ...scanConfig, mode: 'fixed' })}
                  className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${scanConfig.mode === 'fixed' ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${scanConfig.mode === 'fixed' ? 'border-indigo-600' : 'border-gray-300'}`}>
                    {scanConfig.mode === 'fixed' && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-indigo-600" />
                        <span className="font-medium text-gray-700">Horários Fixos</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Busca automática às 08:00, 12:00 e 16:00</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="Petacorp Logo" className="h-10 w-auto object-contain" />
            <div className="h-8 w-px bg-gray-200"></div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AutoMail Dispatcher</h1>
              <p className="text-xs text-gray-500">Monitorando: {dirHandle?.name || '...'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Status Badge for Auto Scan */}
             <div 
                className={`hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
                    scanConfig.mode !== 'disabled' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}
             >
                {scanConfig.mode === 'disabled' && <span>Auto: Off</span>}
                {scanConfig.mode === 'interval' && <span>Auto: {scanConfig.intervalMinutes}min</span>}
                {scanConfig.mode === 'fixed' && <span>Auto: 8h, 12h, 16h</span>}
             </div>

             <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                <Clock className="w-4 h-4" />
                <span>Última: {lastScanTime ? lastScanTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span>
             </div>

             <div className="flex items-center gap-2 border-l pl-4">
                <button 
                    onClick={() => setShowSettings(true)}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition"
                    title="Configurações de Varredura"
                >
                    <Settings className="w-5 h-5" />
                </button>

                <button 
                    onClick={() => dirHandle && scanDirectory(dirHandle)}
                    disabled={isScanning}
                    className={`p-2 rounded-full hover:bg-gray-100 transition ${isScanning ? 'animate-spin text-blue-500' : 'text-gray-600'}`}
                    title="Atualizar Agora"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
             </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        
        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
                <strong>Atenção:</strong> Devido à segurança do navegador, anexos não podem ser adicionados automaticamente.
                Arraste o arquivo identificado para a janela do e-mail antes de enviar.
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-gray-500 text-sm font-medium mb-1">Pendentes</div>
                <div className="text-3xl font-bold text-gray-900">
                    {recipients.filter(r => r.status === 'pending').length}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-blue-500 text-sm font-medium mb-1">Arquivos Encontrados</div>
                <div className="text-3xl font-bold text-blue-600">
                    {recipients.filter(r => r.status === 'file_found' || r.status === 'ready').length}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-green-500 text-sm font-medium mb-1">Enviados</div>
                <div className="text-3xl font-bold text-green-600">
                    {recipients.filter(r => r.status === 'sent').length}
                </div>
            </div>
            
            {/* Action Card */}
            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 shadow-sm flex flex-col justify-center items-center">
                <button
                    onClick={handleSendAll}
                    disabled={recipients.filter(r => r.status === 'ready').length === 0}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow"
                >
                    <Zap className="w-4 h-4" />
                    Enviar Todos ({recipients.filter(r => r.status === 'ready').length})
                </button>
                <span className="text-[10px] text-indigo-400 mt-2 text-center">Requer permissão de pop-ups</span>
            </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Destinatário</th>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Status</th>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Arquivo Identificado</th>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {recipients.map((recipient) => (
                            <tr key={recipient.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{recipient.name}</div>
                                    <div className="text-xs text-gray-500">{recipient.agency}</div>
                                    <div className="text-xs text-gray-400">{recipient.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    {recipient.status === 'pending' && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                            <Search className="w-3 h-3" /> Aguardando arquivo
                                        </span>
                                    )}
                                    {recipient.status === 'file_found' && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 animate-pulse">
                                            <RefreshCw className="w-3 h-3 animate-spin" /> Gerando E-mail...
                                        </span>
                                    )}
                                    {recipient.status === 'ready' && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                                            <CheckCircle className="w-3 h-3" /> Pronto para envio
                                        </span>
                                    )}
                                    {recipient.status === 'sent' && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                            <CheckCircle className="w-3 h-3" /> Enviado
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {recipient.matchedFileName ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-700">
                                            <FileIcon className="w-4 h-4 text-gray-400" />
                                            <span className="font-mono bg-gray-100 px-1 rounded">{recipient.matchedFileName}</span>
                                        </div>
                                    ) : (
                                        <span className="text-sm text-gray-300 italic">Nenhum arquivo correspondente</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {recipient.status === 'ready' ? (
                                        <button 
                                            onClick={() => handleSend(recipient)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shadow-sm hover:shadow active:scale-95"
                                        >
                                            <Send className="w-4 h-4" />
                                            Enviar E-mail
                                        </button>
                                    ) : recipient.status === 'sent' ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                disabled 
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
                                            >
                                                Concluído
                                            </button>
                                            <button
                                                onClick={() => handleResetStatus(recipient)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                title="Desfazer envio"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button disabled className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-300 text-sm font-medium rounded-lg cursor-not-allowed">
                                            Aguardando
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {recipients.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                                    Nenhum destinatário carregado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
            Powered by Gemini AI • React FS Access API
        </div>
      </footer>
    </div>
  );
};

export default App;
