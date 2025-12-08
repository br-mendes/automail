import React, { useState, useEffect, useCallback } from 'react';
import { FolderOpen, RefreshCw, Send, CheckCircle, Clock, File as FileIcon, Search, Mail, AlertTriangle } from 'lucide-react';
import { AppState, Recipient, FileEntry } from './types';
import { CsvUploader } from './components/CsvUploader';
import { findBestMatch, generateEmailContent } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD_CSV);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

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

  // 4. Matching Logic (Triggered when files or recipients change)
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

        // 1. Exact Match Attempt (e.g. "JohnDoe.pdf" contains "John Doe")
        // Basic normalization for exact check
        const normalizedName = r.name.toLowerCase().replace(/\s/g, '');
        const exactMatch = files.find(f => f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedName));

        if (exactMatch) {
            updatedRecipients[i] = { ...r, status: 'file_found', matchedFileName: exactMatch.name };
            hasChanges = true;
        } else {
            // 2. AI Fuzzy Match (Only if exact match fails and we haven't tried recently)
            // Limit AI calls to avoid rate limits in this loop - purely for demo logic
            // In a real app, you might debounce this or trigger it manually
            const aiMatchName = await findBestMatch(r.name, fileNames);
            if (aiMatchName) {
                updatedRecipients[i] = { ...r, status: 'file_found', matchedFileName: aiMatchName };
                hasChanges = true;
            }
        }
      }

      if (hasChanges) {
        setRecipients(updatedRecipients);
      }
    };

    processMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]); // We depend on files updating. We avoid adding recipients to deps to avoid loops, only re-run if files list changes.

  // 5. Generate Email Content (Triggered when a file is found but content not generated)
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
    
    // Note: mailto does not support attachments programmatically due to browser security.
    window.open(`mailto:${recipient.email}?subject=${subject}&body=${body}`, '_blank');
    
    // Update status to sent locally
    setRecipients(prev => prev.map(r => r.id === recipient.id ? { ...r, status: 'sent' } : r));
  };

  // Render Functions
  if (appState === AppState.UPLOAD_CSV) {
    return <CsvUploader onDataLoaded={handleCsvLoaded} />;
  }

  if (appState === AppState.SELECT_FOLDER) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white p-12 rounded-2xl shadow-xl text-center max-w-lg">
          <div className="bg-indigo-50 p-6 rounded-full inline-block mb-6">
            <FolderOpen className="w-16 h-16 text-indigo-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Selecionar Pasta Monitorada</h2>
          <p className="text-gray-600 mb-8">
            Escolha a pasta do Windows onde os anexos (PDFs, Docs) serão salvos.
            O sistema irá monitorar esta pasta automaticamente.
          </p>
          <button 
            onClick={handleSelectFolder}
            className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition shadow-lg hover:shadow-xl flex items-center gap-3 mx-auto"
          >
            <FolderOpen className="w-5 h-5" />
            Escolher Pasta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AutoMail Dispatcher</h1>
              <p className="text-xs text-gray-500">Monitorando: {dirHandle?.name || '...'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                <Clock className="w-4 h-4" />
                <span>Última leitura: {lastScanTime ? lastScanTime.toLocaleTimeString() : 'Nunca'}</span>
             </div>
             <button 
                onClick={() => dirHandle && scanDirectory(dirHandle)}
                disabled={isScanning}
                className={`p-2 rounded-full hover:bg-gray-100 transition ${isScanning ? 'animate-spin text-blue-500' : 'text-gray-600'}`}
             >
                <RefreshCw className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        
        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
                <strong>Atenção:</strong> Devido à segurança do navegador, anexos não podem ser adicionados automaticamente ao cliente de e-mail. 
                O sistema irá gerar o texto, mas você deve arrastar o arquivo identificado para a janela do e-mail antes de enviar.
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                                        <button disabled className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed">
                                            Concluído
                                        </button>
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