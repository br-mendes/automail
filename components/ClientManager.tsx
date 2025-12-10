
import React, { useState, useRef, useMemo } from 'react';
import { Client, AVAILABLE_SERVICES } from '../types';
import { Plus, Trash2, Users, ArrowRight, Download, Upload, FileText, Search, ArrowLeft, Edit2, X, Save, CheckSquare, Square, Filter, FilePenLine } from 'lucide-react';
import Papa from 'papaparse';

interface ClientManagerProps {
  clients: Client[];
  onUpdateClients: (clients: Client[]) => void;
  onNext: () => void;
  onBack?: () => void;
}

export const ClientManager: React.FC<ClientManagerProps> = ({ clients, onUpdateClients, onNext, onBack }) => {
  const [newClient, setNewClient] = useState<Omit<Client, 'id'>>({
    sigla: '',
    name: '',
    email: '',
    services: [],
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState<string>(''); // New: Service Filter
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to merge emails into existing client list by Sigla
  const mergeClients = (currentList: Client[], incoming: Omit<Client, 'id'>[]) => {
      const map = new Map<string, Client>();

      // Load current
      currentList.forEach(c => map.set(c.sigla.toLowerCase().trim(), c));

      incoming.forEach(inc => {
          const key = inc.sigla.toLowerCase().trim();
          const existing = map.get(key);
          
          if (existing) {
              // Merge emails
              const existingEmails = existing.email.split(/[,;]+/).map(e => e.trim());
              const newEmails = inc.email.split(/[,;]+/).map(e => e.trim());
              const uniqueEmails = Array.from(new Set([...existingEmails, ...newEmails])).filter(Boolean).join('; ');
              
              // Merge services
              const existingServices = existing.services || [];
              const newServices = inc.services || [];
              const uniqueServices = Array.from(new Set([...existingServices, ...newServices]));

              map.set(key, { 
                  ...existing, 
                  email: uniqueEmails, 
                  name: inc.name || existing.name,
                  services: uniqueServices,
                  notes: inc.notes || existing.notes // Prefer new notes if provided, else keep existing
              });
          } else {
              // Add new
              map.set(key, {
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                  sigla: inc.sigla.trim(),
                  name: inc.name.trim(),
                  email: inc.email.replace(/,/g, ';').trim(),
                  services: inc.services || [],
                  notes: inc.notes || ''
              });
          }
      });

      return Array.from(map.values());
  };

  const handleSiglaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-Uppercase
    const inputSigla = e.target.value.toUpperCase();
    
    // Check if Sigla already exists (case insensitive)
    const existing = clients.find(c => c.sigla.toLowerCase().trim() === inputSigla.toLowerCase().trim());
    
    setNewClient(prev => ({
        ...prev,
        sigla: inputSigla,
        // Auto-fill Name, Services and Notes if match found
        name: existing ? existing.name : prev.name,
        services: existing ? (existing.services || []) : prev.services,
        notes: existing ? (existing.notes || '') : prev.notes
    }));
  };

  const handleSave = () => {
    if (!newClient.sigla || !newClient.name || !newClient.email) return;

    let updatedList: Client[];

    if (editingId) {
        updatedList = clients.map(c => {
            if (c.id === editingId) {
                return {
                    ...c,
                    sigla: newClient.sigla,
                    name: newClient.name,
                    email: newClient.email.replace(/,/g, ';'), // Ensure semicolons
                    services: newClient.services,
                    notes: newClient.notes
                };
            }
            return c;
        });
        setEditingId(null);
    } else {
        // Add Mode: Use merge logic to prevent duplicates
        updatedList = mergeClients(clients, [{
            sigla: newClient.sigla,
            name: newClient.name,
            email: newClient.email,
            services: newClient.services,
            notes: newClient.notes
        }]);
    }

    onUpdateClients(updatedList);
    setNewClient({ sigla: '', name: '', email: '', services: [], notes: '' });
  };

  const handleEdit = (client: Client) => {
      setNewClient({
          sigla: client.sigla,
          name: client.name,
          email: client.email,
          services: client.services || [],
          notes: client.notes || ''
      });
      setEditingId(client.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
      setNewClient({ sigla: '', name: '', email: '', services: [], notes: '' });
      setEditingId(null);
  };

  const toggleService = (service: string) => {
      setNewClient(prev => {
          const current = prev.services || [];
          if (current.includes(service)) {
              return { ...prev, services: current.filter(s => s !== service) };
          } else {
              return { ...prev, services: [...current, service] };
          }
      });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este cliente?')) {
      onUpdateClients(clients.filter(c => c.id !== id));
      if (editingId === id) handleCancelEdit();
      const newSet = new Set(selectedIds);
      newSet.delete(id);
      setSelectedIds(newSet);
    }
  };

  const handleBulkDelete = () => {
      if (selectedIds.size === 0) return;
      if (window.confirm(`Tem certeza que deseja remover os ${selectedIds.size} clientes selecionados?`)) {
          onUpdateClients(clients.filter(c => !selectedIds.has(c.id)));
          setSelectedIds(new Set());
          if (editingId && selectedIds.has(editingId)) handleCancelEdit();
      }
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === filteredClients.length && filteredClients.length > 0) {
          setSelectedIds(new Set());
      } else {
          const newSet = new Set(selectedIds);
          filteredClients.forEach(c => newSet.add(c.id));
          setSelectedIds(newSet);
      }
  };

  const handleExport = () => {
    const csvData = clients.map(c => ({
      Sigla: c.sigla,
      Nome: c.name,
      Email: c.email.replace(/;/g, ','),
      Servicos: (c.services || []).join(';'),
      Observacoes: c.notes || ''
    }));

    const csv = Papa.unparse(csvData, {
      quotes: true,
      delimiter: ";", 
    });
    
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_petacorp_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        const rows = results.data as any[];
        const incomingClients: Omit<Client, 'id'>[] = [];
        
        rows.forEach((row) => {
            const keys = Object.keys(row);
            const getVal = (key: string) => {
                const foundKey = keys.find(k => k.trim().toLowerCase() === key.toLowerCase());
                return foundKey ? row[foundKey] : undefined;
            };

            const sigla = getVal('sigla') || getVal('orgao') || getVal('agency');
            const name = getVal('nome') || getVal('name');
            const email = getVal('email') || getVal('e-mail');
            const servicosRaw = getVal('servicos') || getVal('services') || '';
            const notes = getVal('observacoes') || getVal('notes') || '';

            if (sigla && name && email) {
                // Parse services from CSV (semicolon separated)
                let services: string[] = [];
                if (servicosRaw) {
                    services = servicosRaw.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                }

                incomingClients.push({
                    sigla: sigla.toString().trim(),
                    name: name.toString().trim(),
                    email: email.toString().replace(/,/g, ';'),
                    services: services,
                    notes: notes.toString().trim()
                });
            }
        });

        if (incomingClients.length > 0) {
          const merged = mergeClients(clients, incomingClients);
          onUpdateClients(merged);
          alert(`${incomingClients.length} linhas processadas.`);
        } else {
          alert('Não foi possível identificar clientes válidos.');
        }
      },
      error: () => {
        alert('Erro ao ler o arquivo CSV.');
      }
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredClients = useMemo(() => {
      const result = clients.filter(client => {
        const matchesTerm = 
            client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            client.sigla.toLowerCase().includes(searchTerm.toLowerCase()) ||
            client.email.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesService = filterService 
            ? (client.services && client.services.includes(filterService))
            : true;

        return matchesTerm && matchesService;
      });
      // Sort alphabetically by Sigla
      return result.sort((a, b) => a.sigla.localeCompare(b.sigla));
  }, [clients, searchTerm, filterService]);

  const allSelected = filteredClients.length > 0 && selectedIds.size >= filteredClients.length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
      <div className="max-w-6xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header - Reorganized into multi-row layout */}
        <div className="bg-white p-6 border-b border-gray-100 flex flex-col gap-6">
            
            {/* Row 1: Title and Back Button */}
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="bg-blue-50 p-3 rounded-xl hidden sm:block">
                    <Users className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Gerenciar Clientes</h2>
                    <p className="text-gray-500 text-sm">Cadastre os órgãos, e-mails e serviços contratados.</p>
                </div>
            </div>
            
            {/* Row 2: Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4 w-full">
                {/* Service Filter */}
                <div className="relative w-full md:w-1/3">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                        value={filterService}
                        onChange={(e) => setFilterService(e.target.value)}
                        className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white text-gray-600"
                    >
                        <option value="">Todos Serviços</option>
                        {AVAILABLE_SERVICES.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                {/* Text Search */}
                <div className="relative w-full md:w-2/3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar por Sigla, Nome ou E-mail..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Row 3: Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 w-full">
                 <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
                    <button onClick={handleExport} className="flex-1 py-2.5 px-4 text-gray-700 bg-gray-50 border border-gray-200 hover:text-green-700 hover:border-green-200 hover:bg-green-50 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <Download className="w-4 h-4" />
                        Exportar
                    </button>
                    <button onClick={handleImportClick} className="flex-1 py-2.5 px-4 text-gray-700 bg-gray-50 border border-gray-200 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <Upload className="w-4 h-4" />
                        Importar
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImport} accept=".csv" className="hidden" />
                </div>

                {clients.length > 0 && !editingId && (
                    <button 
                        onClick={onNext}
                        className="w-full sm:w-auto px-8 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                    >
                        Continuar
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>

        {/* Form */}
        <div className={`p-6 border-b border-gray-200 transition-colors ${editingId ? 'bg-yellow-50' : 'bg-gray-50'}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${editingId ? 'text-yellow-700' : 'text-gray-500'}`}>
                    {editingId ? <><Edit2 className="w-4 h-4" /> Editando Cliente</> : 'Novo Cadastro / Adicionar à Sigla'}
                </h3>
                {editingId && (
                    <button onClick={handleCancelEdit} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
                        <X className="w-3 h-3" /> Cancelar
                    </button>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Sigla (Busca)</label>
                    <input 
                        type="text" 
                        placeholder="Ex: JFAL"
                        value={newClient.sigla}
                        onChange={handleSiglaChange}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm uppercase"
                        title="Sigla usada para identificar o arquivo"
                    />
                </div>
                <div className="md:col-span-5">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome do Órgão</label>
                    <input 
                        type="text" 
                        placeholder="Ex: Justiça Federal de Alagoas"
                        value={newClient.name}
                        onChange={e => setNewClient({...newClient, name: e.target.value})}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                    />
                </div>
                <div className="md:col-span-5">
                    <label className="block text-xs font-medium text-gray-700 mb-1">E-mails (Separados por ;)</label>
                    <input 
                        type="text" 
                        placeholder="nome@exemplo.com; outro@exemplo.com"
                        value={newClient.email}
                        onChange={e => setNewClient({...newClient, email: e.target.value})}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                    />
                </div>
                
                {/* Services Checkboxes */}
                <div className="md:col-span-12">
                    <label className="block text-xs font-medium text-gray-700 mb-2">Serviços Contratados</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {AVAILABLE_SERVICES.map(service => (
                            <label key={service} className="flex items-center gap-2 cursor-pointer select-none">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                    (newClient.services || []).includes(service) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                                }`}>
                                    {(newClient.services || []).includes(service) && <CheckSquare className="w-3 h-3 text-white" />}
                                </div>
                                <input 
                                    type="checkbox" 
                                    className="hidden"
                                    checked={(newClient.services || []).includes(service)}
                                    onChange={() => toggleService(service)}
                                />
                                <span className="text-xs text-gray-700">{service}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Notes Field */}
                <div className="md:col-span-12">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Observações (Opcional)</label>
                    <textarea 
                        rows={2}
                        placeholder="Informações adicionais sobre o cliente..."
                        value={newClient.notes}
                        onChange={e => setNewClient({...newClient, notes: e.target.value})}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                    />
                </div>

                <div className="md:col-span-12 mt-2">
                    <button 
                        onClick={handleSave}
                        disabled={!newClient.sigla || !newClient.name || !newClient.email}
                        className={`w-full py-2.5 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm
                            ${editingId ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'}
                        `}
                    >
                        {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {editingId ? 'Salvar Cliente' : 'Adicionar Cliente'}
                    </button>
                </div>
            </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
             <div className="bg-red-50 border-b border-red-100 p-3 flex justify-between items-center px-6 animate-in fade-in slide-in-from-top-2">
                <span className="text-sm text-red-700 font-medium">
                    {selectedIds.size} {selectedIds.size === 1 ? 'item selecionado' : 'itens selecionados'}
                </span>
                <button 
                    onClick={handleBulkDelete}
                    className="flex items-center gap-2 text-sm text-red-600 bg-white border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-600 hover:text-white transition shadow-sm"
                >
                    <Trash2 className="w-4 h-4" />
                    Excluir Selecionados
                </button>
             </div>
        )}

        {/* List */}
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-white border-b border-gray-100">
                    <tr>
                        <th className="w-12 px-6 py-4">
                            <button 
                                onClick={toggleSelectAll} 
                                className="text-gray-400 hover:text-gray-600"
                            >
                                {allSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                            </button>
                        </th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Sigla</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Nome / Serviços</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Destinatários</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredClients.map(client => (
                        <tr key={client.id} className={`hover:bg-gray-50 group transition-colors ${editingId === client.id ? 'bg-yellow-50' : ''}`}>
                            <td className="px-6 py-4 align-top">
                                <button 
                                    onClick={() => toggleSelection(client.id)}
                                    className="text-gray-300 hover:text-gray-500"
                                >
                                    {selectedIds.has(client.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                                </button>
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-700 text-sm align-top">
                                {client.sigla}
                                {client.notes && (
                                    <div className="mt-2 text-gray-400" title="Possui observações">
                                        <FilePenLine className="w-3.5 h-3.5" />
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-gray-700 text-sm align-top">
                                <div className="font-semibold">{client.name}</div>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {(client.services || []).length > 0 ? (
                                        (client.services || []).map(s => (
                                            <span key={s} className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-100 font-medium">
                                                {s}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">Nenhum serviço selecionado</span>
                                    )}
                                </div>
                                {client.notes && (
                                    <div className="mt-2 text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
                                        {client.notes}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-gray-500 font-mono text-xs break-all leading-relaxed max-w-md align-top">
                                {client.email.replace(/,/g, ';').split(';').map((e, i) => (
                                    <span key={i} className="inline-block bg-white rounded px-1.5 py-0.5 mr-1 mb-1 border border-gray-200 shadow-sm text-gray-600">
                                        {e.trim()}
                                    </span>
                                ))}
                            </td>
                            <td className="px-6 py-4 text-right align-top">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleEdit(client)}
                                        className="text-gray-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(client.id)}
                                        className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition"
                                        title="Remover"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredClients.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-8 py-12 text-center text-gray-400">
                                <div className="flex flex-col items-center justify-center">
                                    <FileText className="w-8 h-8 text-gray-300 mb-2" />
                                    <p>Nenhum cliente encontrado.</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};
