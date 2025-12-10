
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, RefreshCw, Send, CheckCircle, Clock, File as FileIcon, Search, AlertTriangle, RotateCcw, Zap, Settings, X, CalendarClock, Timer, Users, Mail, ArrowLeft, LayoutDashboard, History, ChevronRight, Filter, MonitorPlay, Trash2, XCircle, ArrowUp } from 'lucide-react';
import { AppState, Client, Recipient, FileEntry, AutoScanConfig, SentLog, DashboardTab } from './types';
import { ClientManager } from './components/ClientManager';
import { generateEmailContent, findKeywordMatch } from './services/geminiService';
import { COMPANY_LOGO_URL } from './constants';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  
  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sentHistory, setSentHistory] = useState<SentLog[]>([]);
  
  // Settings
  const [globalCC, setGlobalCC] = useState<string>("suporte-gerencial@petacorp.com.br; financeiro@petacorp.com.br");
  const [scanConfig, setScanConfig] = useState<AutoScanConfig>({ mode: 'disabled', intervalMinutes: 30 });
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('all');
  const [dashboardSearch, setDashboardSearch] = useState('');

  // File System
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderHistory, setFolderHistory] = useState<FileSystemDirectoryHandle[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  
  const lastAutoScanRef = useRef<number>(0);
  const lastScanSignatureRef = useRef<string>(''); // Cache signature
  
  // Fallback file input ref
  const fallbackFileInputRef = useRef<HTMLInputElement>(null);

  // Scroll To Top Logic
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
        if (window.scrollY > 300) {
            setShowScrollTop(true);
        } else {
            setShowScrollTop(false);
        }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to normalize clients by merging same Sigla
  const normalizeAndMergeClients = (clientList: Client[]): Client[] => {
      const map = new Map<string, Client>();
      clientList.forEach(c => {
          const key = c.sigla.toLowerCase().trim();
          const existing = map.get(key);
          if (existing) {
              const existingEmails = existing.email.split(/[,;]+/).map(e => e.trim());
              const newEmails = c.email.split(/[,;]+/).map(e => e.trim());
              const uniqueEmails = Array.from(new Set([...existingEmails, ...newEmails])).filter(Boolean).join('; '); // Use ; for Outlook
              
              const existingServices = existing.services || [];
              const newServices = c.services || [];
              const uniqueServices = Array.from(new Set([...existingServices, ...newServices]));

              map.set(key, { ...existing, email: uniqueEmails, services: uniqueServices, notes: c.notes || existing.notes });
          } else {
              map.set(key, { ...c, email: c.email.replace(/,/g, ';'), services: c.services || [], notes: c.notes || '' });
          }
      });
      return Array.from(map.values());
  };

  // 1. Initialize from LocalStorage
  useEffect(() => {
    const savedClients = localStorage.getItem('petacorp_clients');
    const savedCC = localStorage.getItem('petacorp_cc');
    const savedHistory = localStorage.getItem('petacorp_history');
    const savedScanConfig = localStorage.getItem('petacorp_scan_config');
    
    if (savedClients) {
      try {
        const parsed = JSON.parse(savedClients);
        // Ensure data consistency on load
        setClients(normalizeAndMergeClients(parsed));
      } catch (e) {
        console.error("Failed to parse saved clients");
      }
    }

    if (savedCC) {
      setGlobalCC(savedCC);
    }

    if (savedScanConfig) {
        try {
            setScanConfig(JSON.parse(savedScanConfig));
        } catch(e) {}
    }
    
    if (savedHistory) {
        try {
            const parsed = JSON.parse(savedHistory);
            // Rehydrate dates
            setSentHistory(parsed.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })));
        } catch(e) {}
    }
  }, []);

  // 2. Save to LocalStorage when changed
  useEffect(() => {
    localStorage.setItem('petacorp_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('petacorp_cc', globalCC);
  }, [globalCC]);
  
  useEffect(() => {
    localStorage.setItem('petacorp_scan_config', JSON.stringify(scanConfig));
  }, [scanConfig]);

  useEffect(() => {
    localStorage.setItem('petacorp_history', JSON.stringify(sentHistory));
  }, [sentHistory]);

  // 3. Map Clients to Runtime Recipients
  useEffect(() => {
    setRecipients(prev => {
        return clients.map(client => {
            const existing = prev.find(p => p.id === client.id);
            return {
                ...client,
                agency: client.sigla, 
                status: existing ? existing.status : 'pending',
                // Keep history of matches if still relevant, but logic will re-evaluate
                matchedFiles: existing ? existing.matchedFiles : [],
                missingServices: existing ? existing.missingServices : [],
                matchedTime: existing ? existing.matchedTime : undefined,
                emailSubject: existing ? existing.emailSubject : undefined,
                emailBody: existing ? existing.emailBody : undefined,
                emailBodyHtml: existing ? existing.emailBodyHtml : undefined,
                overrideTo: existing ? existing.overrideTo : undefined,
                overrideCc: existing ? existing.overrideCc : undefined,
                notes: client.notes // Ensure notes are passed
            };
        });
    });
  }, [clients]);

  // 5. Scan Logic 
  const scanDirectory = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setIsScanning(true);
    const newFiles: FileEntry[] = [];
    
    try {
      // @ts-ignore
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          newFiles.push({ name: entry.name, handle: entry as FileSystemFileHandle });
        }
      }

      // --- Cache Optimization ---
      // Generate a signature based on sorted filenames
      const currentSignature = newFiles.map(f => f.name).sort().join('|');
      
      if (currentSignature === lastScanSignatureRef.current) {
          // No changes in file structure, skip updates
          setLastScanTime(new Date());
          setIsScanning(false);
          return;
      }

      // Update cache
      lastScanSignatureRef.current = currentSignature;
      setFiles(newFiles);
      setLastScanTime(new Date());
    } catch (e) {
      console.error("Error scanning directory", e);
      alert("Erro ao ler a pasta. Permissão expirada ou acesso negado.");
    } finally {
      setIsScanning(false);
    }
  }, []);
  
  // Fallback Scan for File Input (Compatibility Mode)
  const handleFallbackFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
          const fileList = Array.from(event.target.files);
          const newFiles: FileEntry[] = fileList.map(f => ({ name: f.name, handle: f, timestamp: f.lastModified }));
          
          // Generate signature for fallback as well
          const signature = newFiles.map(f => f.name).sort().join('|');
          lastScanSignatureRef.current = signature;

          setFiles(newFiles);
          setLastScanTime(new Date());
          
          // Fake a handle name
          setDirHandle({ name: "Pasta Selecionada (Modo Compatibilidade)" } as any);
          setAppState(AppState.DASHBOARD);
      }
  };

  // 4. Handle Folder Selection
  const handleSelectFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      
      setFolderHistory(prev => {
        if (prev.some(h => h.name === handle.name)) return prev;
        return [...prev, handle];
      });

      // Reset cache when switching folders
      lastScanSignatureRef.current = '';

      setDirHandle(handle);
      setAppState(AppState.DASHBOARD);
      await scanDirectory(handle);
    } catch (err: any) {
      console.error("Folder access denied or cancelled", err);
      if (err.name === 'SecurityError' || err.message.includes('Cross origin')) {
          alert("Seu navegador ou ambiente bloqueou o acesso direto à pasta. Por favor, utilize o botão 'Modo Compatibilidade' abaixo.");
      }
    }
  };

  const handleHistorySelect = async (handle: FileSystemDirectoryHandle) => {
      // Reset cache when switching folders via history
      if (dirHandle?.name !== handle.name) {
          lastScanSignatureRef.current = '';
      }
      setDirHandle(handle);
      setAppState(AppState.DASHBOARD);
      await scanDirectory(handle);
  };

  // 6. Auto-Scan Heartbeat & Calculations
  const getNextScanTime = () => {
    if (scanConfig.mode === 'disabled') return null;
    const now = new Date();
    
    if (scanConfig.mode === 'interval') {
       if (!lastScanTime) return null;
       return new Date(lastScanTime.getTime() + scanConfig.intervalMinutes * 60000);
    }

    if (scanConfig.mode === 'fixed') {
        const targets = [8, 12, 16];
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Find next hour target
        let nextHour = targets.find(t => t > currentHour || (t === currentHour && currentMinute === 0));
        let nextDate = new Date(now);

        if (!nextHour) {
            // Next day 8am
            nextHour = 8;
            nextDate.setDate(nextDate.getDate() + 1);
        }
        nextDate.setHours(nextHour, 0, 0, 0);
        return nextDate;
    }
    return null;
  };

  useEffect(() => {
    if (!dirHandle || scanConfig.mode === 'disabled' || !dirHandle.values) return; // Disable auto-scan for fallback mode

    const checkAutoScan = () => {
      if (isScanning) return;
      const now = new Date();
      const currentTimestamp = now.getTime();
      
      // Prevent rapid firing (at least 1 min between scans)
      if (currentTimestamp - lastAutoScanRef.current < 60000) return;

      let shouldScan = false;

      if (scanConfig.mode === 'interval') {
        const lastRun = lastScanTime ? lastScanTime.getTime() : 0;
        const diffMinutes = (currentTimestamp - lastRun) / 60000;
        if (diffMinutes >= scanConfig.intervalMinutes) {
          shouldScan = true;
        }
      } else if (scanConfig.mode === 'fixed') {
        const hour = now.getHours();
        const minute = now.getMinutes();
        // Fixed times: 08:00, 12:00, 16:00
        // Window of 5 minutes
        const targetHours = [8, 12, 16];
        
        if (targetHours.includes(hour) && minute >= 0 && minute < 5) {
          const lastRunDate = lastScanTime ? new Date(lastScanTime) : new Date(0);
          // Check if ran this hour today
          if (lastRunDate.getHours() !== hour || lastRunDate.getDate() !== now.getDate()) {
              shouldScan = true;
          }
        }
      }

      if (shouldScan) {
        lastAutoScanRef.current = currentTimestamp;
        scanDirectory(dirHandle);
      }
    };

    const intervalId = setInterval(checkAutoScan, 10000); // Check every 10s
    return () => clearInterval(intervalId);
  }, [dirHandle, scanConfig, lastScanTime, isScanning, scanDirectory]);


  // 7. Matching Logic (Multi-Service & CAIXA)
  useEffect(() => {
    if (files.length === 0 || recipients.length === 0) return;

    const processMatches = async () => {
      const updatedRecipients = [...recipients];
      let hasChanges = false;
      const fileNames = files.map(f => f.name);

      for (let i = 0; i < updatedRecipients.length; i++) {
        const r = updatedRecipients[i];
        
        // Skip if sent
        if (r.status === 'sent') continue;

        // Determine if CAIXA
        const isCaixa = r.sigla.toLowerCase().includes('caixa') || r.sigla.toLowerCase().includes('jamc') || r.name.toLowerCase().includes('caixa');
        
        const matchedFiles: { service: string, fileName: string, timestamp?: number }[] = [];
        const missingServices: string[] = [];

        // Helper to find file entry and get timestamp
        const getFileTimestamp = async (fileName: string): Promise<number | undefined> => {
            const entry = files.find(f => f.name === fileName);
            if (!entry) return undefined;
            
            // Check if we already have a cached timestamp (from fallback)
            if (entry.timestamp) return entry.timestamp;

            try {
                if (entry.handle instanceof File) {
                    return entry.handle.lastModified;
                } else {
                    // It's a FileSystemFileHandle
                    const fileObj = await (entry.handle as FileSystemFileHandle).getFile();
                    return fileObj.lastModified;
                }
            } catch (e) {
                return undefined;
            }
        };

        if (isCaixa) {
            // CAIXA Rule: Strictly match JAMC_15762_2020
            const match = findKeywordMatch(r.name, r.sigla, "", fileNames);
            if (match) {
                const ts = await getFileTimestamp(match);
                matchedFiles.push({ service: "Relatório CAIXA (JAMC)", fileName: match, timestamp: ts });
            } else {
                missingServices.push("Relatório JAMC");
            }
        } else {
            // General Rule: Check each service
            const servicesToCheck = (r.services && r.services.length > 0) ? r.services : [];
            
            if (servicesToCheck.length === 0) {
                 // Flag as empty configuration
            } else {
                // Iterate carefully with async/await
                for (const service of servicesToCheck) {
                    const match = findKeywordMatch(r.name, r.sigla, service, fileNames);
                    if (match) {
                        const ts = await getFileTimestamp(match);
                        matchedFiles.push({ service, fileName: match, timestamp: ts });
                    } else {
                        missingServices.push(service);
                    }
                }
            }
        }

        // Determine Status
        const servicesConfigured = isCaixa || (r.services && r.services.length > 0);
        const allFound = servicesConfigured && missingServices.length === 0 && matchedFiles.length > 0;
        
        let newStatus = r.status;
        
        if (allFound) {
            newStatus = r.status === 'ready' ? 'ready' : 'file_found';
        } else {
            newStatus = 'pending';
        }

        // Deep Compare for changes
        const prevFiles = JSON.stringify(r.matchedFiles || []);
        const newFilesStr = JSON.stringify(matchedFiles);
        const prevMissing = JSON.stringify(r.missingServices || []);
        const newMissingStr = JSON.stringify(missingServices);

        if (newStatus !== r.status || prevFiles !== newFilesStr || prevMissing !== newMissingStr) {
             updatedRecipients[i] = {
                 ...r,
                 status: newStatus as any,
                 matchedFiles: matchedFiles,
                 missingServices: missingServices,
                 matchedTime: allFound ? new Date() : undefined
             };
             hasChanges = true;
        }
      }

      if (hasChanges) {
        setRecipients(updatedRecipients);
      }
    };

    processMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]); // Dependency on 'files' ensures it runs only when file list changes (filtered by cache)

  // 8. Generate Email Content
  useEffect(() => {
    const generateContent = async () => {
      // Generate only if 'file_found' (which means newly matched and ready for content gen)
      // or if status is ready but body is empty (manual reset)
      const targets = recipients.filter(r => (r.status === 'file_found' || (r.status === 'ready' && !r.emailBody)));
      
      if (targets.length === 0) return;

      const updatedRecipients = [...recipients];
      
      await Promise.all(targets.map(async (target) => {
        const index = updatedRecipients.findIndex(r => r.id === target.id);
        if (index === -1) return;

        // Use the first matched file name for reference
        const primaryFile = target.matchedFiles && target.matchedFiles.length > 0 ? target.matchedFiles[0].fileName : '';
        
        const content = await generateEmailContent(target.name, target.sigla, primaryFile, target.services);
        
        updatedRecipients[index] = {
            ...updatedRecipients[index],
            emailSubject: content.subject,
            emailBody: content.body,
            emailBodyHtml: content.bodyHtml,
            overrideTo: content.overrideTo,
            overrideCc: content.overrideCc,
            status: 'ready'
        };
      }));

      setRecipients(updatedRecipients);
    };

    generateContent();
  }, [recipients]);


  // Helpers
  const handleSend = (recipient: Recipient) => {
    if (!recipient.emailBody || !recipient.emailSubject) return;

    const subject = encodeURIComponent(recipient.emailSubject);
    const body = encodeURIComponent(recipient.emailBody);
    
    // Check for overrides (e.g. CAIXA used to have them, now we rely on DB but keep support)
    let cc = recipient.overrideCc || globalCC;
    let to = recipient.overrideTo || recipient.email;

    // Outlook requirement: Separator must be ';'
    // Ensure all comma separated values are replaced with semicolons
    cc = cc.replace(/,/g, ';').trim(); 
    to = to.replace(/,/g, ';').trim();
    
    window.open(`mailto:${to}?cc=${cc}&subject=${subject}&body=${body}`, '_blank');
    
    // Log history
    const log: SentLog = {
        id: Date.now().toString() + Math.random(),
        timestamp: new Date(),
        recipientSigla: recipient.sigla,
        recipientEmail: to,
        subject: recipient.emailSubject
    };
    setSentHistory(prev => [log, ...prev]);

    setRecipients(prev => prev.map(r => r.id === recipient.id ? { ...r, status: 'sent' } : r));
  };

  const handleSendPending = () => {
    const readyRecipients = recipients.filter(r => r.status === 'ready');
    if (readyRecipients.length === 0) return;

    const confirmed = window.confirm(`Isso tentará abrir ${readyRecipients.length} janelas de e-mail. Seu navegador pode bloquear pop-ups. Deseja continuar?`);
    if (!confirmed) return;

    readyRecipients.forEach(r => {
        handleSend(r);
    });
  };

  const handleResetStatus = (recipient: Recipient) => {
    setRecipients(prev => prev.map(r => {
        if (r.id !== recipient.id) return r;
        // Check if files still exist
        // Simplified check, real check happens in effect loop
        return {
            ...r,
            status: 'pending'
        };
    }));
  };

  const handleClearHistory = () => {
    if (window.confirm("Tem certeza que deseja apagar todo o histórico de envios desta lista?")) {
        setSentHistory([]);
    }
  };

  // Filtered List
  const getFilteredRecipients = () => {
      let filtered = recipients;
      if (activeTab === 'pending') filtered = recipients.filter(r => r.status === 'pending');
      if (activeTab === 'ready') filtered = recipients.filter(r => r.status === 'ready');
      if (activeTab === 'sent') filtered = recipients.filter(r => r.status === 'sent');
      
      // Filter by Search Term
      if (dashboardSearch) {
          const lowerTerm = dashboardSearch.toLowerCase();
          filtered = filtered.filter(r => 
              r.name.toLowerCase().includes(lowerTerm) ||
              r.sigla.toLowerCase().includes(lowerTerm) ||
              r.email.toLowerCase().includes(lowerTerm)
          );
      }
      
      // Sort alphabetically by Sigla
      return filtered.sort((a, b) => a.sigla.localeCompare(b.sigla));
  };

  const displayRecipients = getFilteredRecipients();
  const nextScan = getNextScanTime();

  // --- STATE VIEWS ---

  // 1. HOME SCREEN
  if (appState === AppState.HOME) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4 relative">
        {showScrollTop && (
            <button 
                onClick={scrollToTop}
                className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition z-50 animate-bounce-subtle"
                title="Voltar ao topo"
            >
                <ArrowUp className="w-5 h-5" />
            </button>
        )}

        <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
            {/* Left/Top Branding Side */}
            <div className="bg-gradient-to-br from-gray-900 to-blue-900 p-12 flex flex-col justify-center items-center md:items-start md:w-5/12 text-center md:text-left text-white border-r border-gray-800">
                 <div className="bg-white p-4 rounded-2xl mb-8 shadow-lg shadow-black/20">
                    <img src={COMPANY_LOGO_URL} alt="Petacorp" className="h-16 w-auto object-contain" />
                 </div>
                 <h1 className="text-3xl font-bold mb-4 leading-tight">AutoMail Dispatcher</h1>
                 <p className="text-blue-100/90 text-lg mb-8 leading-relaxed">
                    Automação inteligente de e-mails corporativos com reconhecimento de arquivos via IA.
                 </p>
                 <div className="mt-auto text-xs text-blue-200/60">
                    <a 
                        href="https://petacorp.com.br" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors border-b border-transparent hover:border-white pb-0.5"
                    >
                        Versão 2.6 • Petacorp
                    </a>
                 </div>
            </div>
            
            {/* Right/Bottom Actions Side */}
            <div className="p-12 flex flex-col justify-center gap-6 md:w-7/12 bg-white">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Olá,</h2>
                <p className="text-gray-500 mb-6">Selecione uma ação para continuar:</p>

                <button 
                    onClick={() => setAppState(AppState.MANAGE_CLIENTS)}
                    className="group flex items-start gap-5 p-6 rounded-2xl border border-gray-100 hover:border-blue-500/30 hover:bg-blue-50/50 transition-all text-left shadow-sm hover:shadow-md relative overflow-hidden"
                >
                    <div className="p-3.5 rounded-xl transition-all duration-300 bg-blue-100 group-hover:bg-blue-600 group-hover:scale-110">
                        <Users className="w-6 h-6 text-blue-600 group-hover:text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg transition-colors text-gray-900 group-hover:text-blue-700">Gerenciar Clientes</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Cadastre, importe ou edite a lista de destinatários.
                        </p>
                    </div>
                </button>

                <button 
                    onClick={() => setAppState(AppState.SELECT_FOLDER)}
                    className="group flex items-start gap-5 p-6 rounded-2xl border border-gray-100 hover:border-indigo-500/30 hover:bg-indigo-50/50 transition-all text-left shadow-sm hover:shadow-md relative overflow-hidden"
                >
                    <div className="p-3.5 rounded-xl transition-all duration-300 bg-indigo-100 group-hover:bg-indigo-600 group-hover:scale-110">
                        <LayoutDashboard className="w-6 h-6 text-indigo-600 group-hover:text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg transition-colors text-gray-900 group-hover:text-indigo-700">Monitorar Arquivos</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Selecione a pasta de arquivos locais e inicie os disparos.
                        </p>
                    </div>
                </button>
            </div>
        </div>
      </div>
    );
  }

  // 2. CLIENT MANAGER
  if (appState === AppState.MANAGE_CLIENTS) {
    return (
        <div className="relative">
            <ClientManager 
                clients={clients} 
                onUpdateClients={setClients} 
                onNext={() => setAppState(AppState.SELECT_FOLDER)} // Updated to direct navigation
                onBack={() => setAppState(AppState.HOME)}
            />
            {showScrollTop && (
                <button 
                    onClick={scrollToTop}
                    className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition z-50 animate-bounce-subtle"
                    title="Voltar ao topo"
                >
                    <ArrowUp className="w-5 h-5" />
                </button>
            )}
        </div>
    );
  }

  // 3. SELECT FOLDER
  if (appState === AppState.SELECT_FOLDER) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 relative p-4">
        {showScrollTop && (
            <button 
                onClick={scrollToTop}
                className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition z-50 animate-bounce-subtle"
                title="Voltar ao topo"
            >
                <ArrowUp className="w-5 h-5" />
            </button>
        )}
        <button 
            onClick={() => setAppState(AppState.HOME)}
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-800 transition px-4 py-2 rounded-full hover:bg-white/80"
        >
            <ArrowLeft className="w-5 h-5" />
            Voltar ao Início
        </button>

        <div className="bg-white p-12 rounded-2xl shadow-xl text-center max-w-2xl w-full flex flex-col items-center">
          <div className="mb-8">
            <img src={COMPANY_LOGO_URL} alt="Petacorp Logo" className="h-12 object-contain mx-auto" />
          </div>
          <div className="bg-indigo-50 p-6 rounded-full inline-block mb-6">
            <FolderOpen className="w-16 h-16 text-indigo-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Selecionar Pasta Monitorada</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            Escolha a pasta local onde os anexos (PDFs, Docs) estão salvos para iniciar a varredura automática.
            <br/><span className="text-xs text-gray-400 block mt-2">Para SharePoint: Selecione a pasta sincronizada no seu Windows Explorer.</span>
          </p>

          <button 
            onClick={handleSelectFolder}
            className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-3 w-full sm:w-auto justify-center mb-4"
          >
            <FolderOpen className="w-5 h-5" />
            Nova Pasta
          </button>
          
          {/* Compatibility Mode / Fallback Input */}
          <div className="relative">
              <input 
                 type="file" 
                 // @ts-ignore
                 webkitdirectory="" 
                 directory="" 
                 multiple 
                 onChange={handleFallbackFileSelect}
                 className="hidden"
                 ref={fallbackFileInputRef}
              />
              <button 
                onClick={() => fallbackFileInputRef.current?.click()}
                className="text-xs text-indigo-500 hover:text-indigo-700 underline"
              >
                Modo Compatibilidade (Se ocorrer erro ao abrir pasta)
              </button>
          </div>

           <button 
            onClick={() => setAppState(AppState.MANAGE_CLIENTS)}
            className="mt-6 text-sm text-gray-400 hover:text-indigo-600 flex items-center gap-1.5 transition"
          >
            <Users className="w-4 h-4" />
            Precisa editar clientes antes?
          </button>

          {folderHistory.length > 0 && (
            <div className="mt-10 pt-8 border-t w-full">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 text-left flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Histórico de Sessão
                </h3>
                <div className="space-y-3">
                    {folderHistory.map((handle, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleHistorySelect(handle)}
                            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-white border border-transparent hover:border-indigo-200 hover:shadow-md rounded-xl transition-all group"
                        >
                            <div className="flex items-center gap-3 text-left overflow-hidden">
                                <div className="bg-white p-2 rounded-lg border shadow-sm group-hover:border-indigo-100">
                                    <FolderOpen className="w-5 h-5 text-indigo-500" />
                                </div>
                                <span className="font-medium text-gray-700 truncate group-hover:text-indigo-700">
                                    {handle.name}
                                </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                        </button>
                    ))}
                </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. DASHBOARD (DEFAULT)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative">
      {showScrollTop && (
        <button 
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition z-50 animate-bounce-subtle"
            title="Voltar ao topo"
        >
            <ArrowUp className="w-5 h-5" />
        </button>
      )}
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg"><Settings className="w-5 h-5 text-blue-600" /></div>
                Configurações
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-8 overflow-y-auto">
              {/* Settings Content */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Destinatários Cópia (CC) - Padrão Geral
                </h4>
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                    <p className="text-xs text-blue-700 mb-2">
                        Estes e-mails serão adicionados automaticamente em Cópia em disparos normais (exceto quando houver regra específica do cliente).
                        <br/>
                        <span className="opacity-75">Use <strong>ponto e vírgula (;)</strong> para separar múltiplos e-mails (Padrão Outlook).</span>
                    </p>
                    <textarea 
                        value={globalCC}
                        onChange={(e) => setGlobalCC(e.target.value)}
                        placeholder="email1@petacorp.com.br; email2@petacorp.com.br"
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border text-sm h-20"
                    />
                </div>
              </div>
              
              <hr className="border-gray-100" />

              <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Rotina de Varredura
                  </h4>
                  <p className="text-xs text-gray-500 mb-2">Defina com que frequência o sistema deve buscar novos arquivos na pasta selecionada.</p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {/* Manual Mode */}
                    <button
                        onClick={() => setScanConfig({ ...scanConfig, mode: 'disabled' })}
                        className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                            scanConfig.mode === 'disabled' 
                            ? 'bg-gray-800 text-white border-gray-800 shadow-lg' 
                            : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                    >
                        <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${scanConfig.mode === 'disabled' ? 'border-white' : 'border-gray-300'}`}>
                            {scanConfig.mode === 'disabled' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                        <div>
                            <span className="font-bold block text-sm">Manual (Padrão)</span>
                            <span className={`text-xs ${scanConfig.mode === 'disabled' ? 'text-gray-300' : 'text-gray-400'}`}>
                                A busca só ocorre quando você clica no botão atualizar ou troca de pasta.
                            </span>
                        </div>
                    </button>

                    {/* Interval Mode */}
                    <button
                        onClick={() => setScanConfig({ ...scanConfig, mode: 'interval' })}
                        className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                            scanConfig.mode === 'interval' 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                            : 'bg-white border-gray-200 hover:border-blue-200 text-gray-600'
                        }`}
                    >
                        <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${scanConfig.mode === 'interval' ? 'border-white' : 'border-gray-300'}`}>
                            {scanConfig.mode === 'interval' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                        <div className="w-full">
                            <span className="font-bold block text-sm flex justify-between items-center w-full">
                                Intervalos Regulares
                                {scanConfig.mode === 'interval' && (
                                     <select 
                                        value={scanConfig.intervalMinutes}
                                        onChange={(e) => setScanConfig({ ...scanConfig, intervalMinutes: Number(e.target.value) })}
                                        className="text-xs text-blue-800 bg-white border-none rounded py-0.5 pl-2 pr-6 cursor-pointer focus:ring-0"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <option value={5}>5 min</option>
                                        <option value={10}>10 min</option>
                                        <option value={30}>30 min</option>
                                        <option value={60}>1 hora</option>
                                    </select>
                                )}
                            </span>
                            <span className={`text-xs ${scanConfig.mode === 'interval' ? 'text-blue-100' : 'text-gray-400'}`}>
                                Busca novos arquivos a cada X minutos automaticamente.
                            </span>
                        </div>
                    </button>

                    {/* Fixed Mode */}
                    <button
                        onClick={() => setScanConfig({ ...scanConfig, mode: 'fixed' })}
                        className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                            scanConfig.mode === 'fixed' 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' 
                            : 'bg-white border-gray-200 hover:border-indigo-200 text-gray-600'
                        }`}
                    >
                        <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${scanConfig.mode === 'fixed' ? 'border-white' : 'border-gray-300'}`}>
                            {scanConfig.mode === 'fixed' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                        <div>
                            <span className="font-bold block text-sm flex items-center gap-2">
                                Horários Fixos
                                {scanConfig.mode === 'fixed' && <span className="bg-indigo-500 text-xs px-2 py-0.5 rounded-full">Ativo</span>}
                            </span>
                            <span className={`text-xs ${scanConfig.mode === 'fixed' ? 'text-indigo-100' : 'text-gray-400'}`}>
                                Executa a varredura automaticamente às <strong>08:00, 12:00 e 16:00</strong>.
                            </span>
                        </div>
                    </button>
                  </div>
              </div>
            </div>

            <div className="p-5 border-t bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setShowSettings(false)} className="px-6 py-2.5 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-900 transition shadow-lg">
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setAppState(AppState.HOME)} title="Voltar ao Início">
            <img src={COMPANY_LOGO_URL} alt="Petacorp Logo" className="h-10 w-auto object-contain" />
            <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 hidden sm:block">AutoMail Dispatcher</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Monitorando: <span className="font-semibold text-indigo-600">{dirHandle?.name || '...'}</span></p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 border-l pl-4 ml-2">
                <button onClick={() => setAppState(AppState.SELECT_FOLDER)} className="p-2 rounded-full hover:bg-indigo-50 text-indigo-600 transition" title="Trocar Pasta"><FolderOpen className="w-5 h-5" /></button>
                <button onClick={() => setAppState(AppState.HOME)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition" title="Início"><ArrowLeft className="w-5 h-5" /></button>
                <button onClick={() => setAppState(AppState.MANAGE_CLIENTS)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition hidden sm:block" title="Gerenciar Clientes"><Users className="w-5 h-5" /></button>
                <button onClick={() => setShowSettings(true)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition" title="Configurações"><Settings className="w-5 h-5" /></button>
                <button onClick={() => dirHandle && scanDirectory(dirHandle)} disabled={isScanning} className={`p-2 rounded-full hover:bg-gray-100 transition ${isScanning ? 'animate-spin text-blue-500' : 'text-gray-600'}`} title="Atualizar Agora"><RefreshCw className="w-5 h-5" /></button>
             </div>
          </div>
        </div>
        
        {/* Scan Status Bar */}
        {dirHandle && (
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5 text-xs text-gray-500 flex justify-center sm:justify-end gap-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-1.5">
                    <MonitorPlay className="w-3.5 h-3.5" />
                    Modo: <span className="font-semibold text-gray-700">
                        {scanConfig.mode === 'disabled' && 'Manual'}
                        {scanConfig.mode === 'interval' && `Automático (${scanConfig.intervalMinutes} min)`}
                        {scanConfig.mode === 'fixed' && 'Horários Fixos'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Última: <span className="font-medium text-gray-700">{lastScanTime ? lastScanTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span>
                </div>
                {scanConfig.mode !== 'disabled' && (
                    <div className="flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-blue-600" />
                        Próxima: <span className="font-medium text-blue-700">{nextScan ? nextScan.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}</span>
                    </div>
                )}
            </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-400"></div>
                <div className="text-red-500 text-sm font-medium mb-1">Aguardando Arquivo</div>
                <div className="text-3xl font-bold text-gray-900">
                    {recipients.filter(r => r.status === 'pending').length}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
                <div className="text-yellow-600 text-sm font-medium mb-1">Prontos para Envio</div>
                <div className="text-3xl font-bold text-yellow-700">
                    {recipients.filter(r => r.status === 'ready').length}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-green-400"></div>
                <div className="text-green-500 text-sm font-medium mb-1">Enviados (Sessão)</div>
                <div className="text-3xl font-bold text-green-600">
                    {recipients.filter(r => r.status === 'sent').length}
                </div>
            </div>
            
            {/* Send Pending Action Card */}
            <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-100 shadow-sm flex flex-col justify-center items-center">
                <button
                    onClick={handleSendPending}
                    disabled={recipients.filter(r => r.status === 'ready').length === 0}
                    className="w-full py-2 bg-yellow-600 text-white rounded-lg font-bold hover:bg-yellow-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow"
                >
                    <Zap className="w-4 h-4" />
                    Enviar Pendentes ({recipients.filter(r => r.status === 'ready').length})
                </button>
                <span className="text-[10px] text-yellow-700 mt-2 text-center">Abrirá múltiplos e-mails</span>
            </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4 overflow-x-auto pb-2">
                {[
                    { id: 'all', label: 'Todos', count: recipients.length, color: 'bg-gray-100 text-gray-600', active: 'bg-gray-800 text-white shadow-lg' },
                    { id: 'pending', label: 'Aguardando', count: recipients.filter(r => r.status === 'pending').length, color: 'bg-red-50 text-red-600', active: 'bg-red-600 text-white shadow-lg shadow-red-200' },
                    { id: 'ready', label: 'Prontos', count: recipients.filter(r => r.status === 'ready').length, color: 'bg-yellow-50 text-yellow-700', active: 'bg-yellow-500 text-white shadow-lg shadow-yellow-200' },
                    { id: 'sent', label: 'Enviados', count: recipients.filter(r => r.status === 'sent').length, color: 'bg-green-50 text-green-600', active: 'bg-green-600 text-white shadow-lg shadow-green-200' },
                    { id: 'history', label: 'Histórico', count: null, color: 'bg-indigo-50 text-indigo-600', active: 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as DashboardTab)}
                        className={`px-5 py-3 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 min-w-[120px] justify-center ${
                            activeTab === tab.id ? tab.active : `${tab.color} hover:bg-opacity-80`
                        }`}
                    >
                        {tab.id === 'history' && <History className="w-4 h-4" />}
                        <span>{tab.label}</span>
                        {tab.count !== null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-black/5'}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            
            {/* Dashboard Search */}
            {activeTab !== 'history' && (
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text"
                        placeholder="Buscar destinatário..."
                        value={dashboardSearch}
                        onChange={(e) => setDashboardSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                </div>
            )}
        </div>

        {/* History View */}
        {activeTab === 'history' ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-700 text-lg">Log de Envios</h3>
                    {sentHistory.length > 0 && (
                        <button 
                            onClick={handleClearHistory}
                            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                        >
                            <Trash2 className="w-4 h-4" />
                            Limpar Histórico
                        </button>
                    )}
                </div>
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Data/Hora</th>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Destinatário</th>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Assunto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sentHistory.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    {log.timestamp.toLocaleString()}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{log.recipientSigla}</div>
                                    <div className="text-xs text-gray-400">{log.recipientEmail}</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {log.subject}
                                </td>
                            </tr>
                        ))}
                        {sentHistory.length === 0 && (
                            <tr><td colSpan={3} className="p-8 text-center text-gray-400">Nenhum envio registrado nesta sessão.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        ) : (
            /* Main List */
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Sigla / Órgão</th>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Status</th>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-sm">Arquivos Identificados</th>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-sm text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {displayRecipients.map((recipient) => {
                                const isCaixa = recipient.sigla.toLowerCase().includes('caixa') || recipient.sigla.toLowerCase().includes('jamc');
                                return (
                                <tr key={recipient.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 w-1/4">
                                        <div className="text-lg font-bold text-gray-900">{recipient.sigla}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{recipient.name}</div>
                                        <div className="text-xs text-gray-400 mt-1 max-w-xs truncate" title={recipient.email}>
                                            {recipient.email}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 w-1/6">
                                        {recipient.status === 'pending' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                                                <Search className="w-3 h-3" /> Aguardando Arquivo
                                            </span>
                                        )}
                                        {recipient.status === 'file_found' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 animate-pulse">
                                                <RefreshCw className="w-3 h-3 animate-spin" /> Gerando...
                                            </span>
                                        )}
                                        {recipient.status === 'ready' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
                                                <CheckCircle className="w-3 h-3" /> Pronto p/ Envio
                                            </span>
                                        )}
                                        {recipient.status === 'sent' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                                                <CheckCircle className="w-3 h-3" /> Enviado
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 w-1/3">
                                        {/* File Matches Visuals */}
                                        <div className="space-y-4">
                                            {isCaixa ? (
                                                // CAIXA View
                                                <div className="text-sm">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {recipient.matchedFiles?.some(f => f.service.includes('JAMC')) ? (
                                                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                                                        ) : (
                                                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                                        )}
                                                        <span className="font-bold text-gray-700">Relatório JAMC</span>
                                                    </div>
                                                    {recipient.matchedFiles?.find(f => f.service.includes('JAMC')) && (
                                                        <div className="pl-6 border-l-2 border-green-100 ml-2">
                                                            <div className="font-mono text-xs text-gray-700 break-all bg-gray-50 p-1.5 rounded border border-gray-100 block w-full">
                                                                {recipient.matchedFiles.find(f => f.service.includes('JAMC'))?.fileName}
                                                            </div>
                                                            {recipient.matchedFiles.find(f => f.service.includes('JAMC'))?.timestamp && (
                                                                <div className="text-[10px] text-gray-400 mt-1">
                                                                    Criado em: {new Date(recipient.matchedFiles.find(f => f.service.includes('JAMC'))!.timestamp!).toLocaleString()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                // General View - Iterate Services
                                                (recipient.services && recipient.services.length > 0) ? (
                                                    recipient.services.map((service, idx) => {
                                                        const match = recipient.matchedFiles?.find(f => f.service === service);
                                                        return (
                                                            <div key={idx} className="text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    {match ? (
                                                                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                                                                    ) : (
                                                                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                                                    )}
                                                                    <span className="font-bold text-gray-700">{service}</span>
                                                                </div>
                                                                {match && (
                                                                    <div className="pl-6 border-l-2 border-green-100 ml-2">
                                                                        <div className="font-mono text-xs text-gray-700 break-all bg-gray-50 p-1.5 rounded border border-gray-100 block w-full">
                                                                            {match.fileName}
                                                                        </div>
                                                                        {match.timestamp && (
                                                                            <div className="text-[10px] text-gray-400 mt-1">
                                                                                Criado em: {new Date(match.timestamp).toLocaleString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
                                                        <AlertTriangle className="w-3 h-3" /> Nenhum serviço configurado
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right w-1/6">
                                        {recipient.status === 'ready' ? (
                                            <button 
                                                onClick={() => handleSend(recipient)}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shadow-sm hover:shadow active:scale-95"
                                            >
                                                <Send className="w-4 h-4" />
                                                Enviar
                                            </button>
                                        ) : recipient.status === 'sent' ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleResetStatus(recipient)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                    title="Marcar como pendente novamente"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button disabled className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed">
                                                <Send className="w-4 h-4" />
                                                Enviar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )})
                            }
                            {displayRecipients.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                                        Nenhum registro encontrado para este filtro.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
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
