
import React, { useState, useRef } from 'react';
import { Client } from '../types';
import { Plus, Trash2, Users, ArrowRight, Download, Upload, FileText, Search, ArrowLeft } from 'lucide-react';
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
    email: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!newClient.sigla || !newClient.name || !newClient.email) return;

    // Sanitize manual input as well
    const sanitizedEmail = newClient.email.replace(/;/g, ',').trim();

    const client: Client = {
      id: Date.now().toString(),
      ...newClient,
      email: sanitizedEmail
    };

    onUpdateClients([...clients, client]);
    setNewClient({ sigla: '', name: '', email: '' });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este cliente?')) {
      onUpdateClients(clients.filter(c => c.id !== id));
    }
  };

  const handleExport = () => {
    // Prepare data for CSV
    const csvData = clients.map(c => ({
      Sigla: c.sigla,
      Nome: c.name,
      Email: c.email
    }));

    const csv = Papa.unparse(csvData, {
      quotes: true, // Ensure fields with commas are quoted
      delimiter: ";", // Semicolon is often better for Excel in regions that use comma for decimals, though CSV standard is comma.
    });
    
    // Create Blob with BOM for Excel UTF-8 compatibility
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
        
        const validClients: Client[] = [];
        
        rows.forEach((row) => {
            // Flexible column matching
            const keys = Object.keys(row);
            const getVal = (key: string) => {
                const foundKey = keys.find(k => k.trim().toLowerCase() === key.toLowerCase());
                return foundKey ? row[foundKey] : undefined;
            };

            const sigla = getVal('sigla') || getVal('orgao') || getVal('agency');
            const name = getVal('nome') || getVal('name');
            const email = getVal('email') || getVal('e-mail');

            if (sigla && name && email) {
                // Sanitize emails: Replace semicolons with commas for standard mailto compatibility
                const sanitizedEmail = email.toString().replace(/;/g, ',').trim();

                validClients.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    sigla: sigla.toString().trim(),
                    name: name.toString().trim(),
                    email: sanitizedEmail
                });
            }
        });

        if (validClients.length > 0) {
          onUpdateClients([...clients, ...validClients]);
          alert(`${validClients.length} clientes importados com sucesso!`);
        } else {
          alert('Não foi possível identificar clientes válidos. Verifique se o arquivo possui as colunas: Sigla, Nome, Email.');
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

  const filteredClients = clients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.sigla.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
      <div className="max-w-6xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-white p-6 border-b border-gray-100 flex flex-col xl:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4 w-full xl:w-auto">
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
                    <p className="text-gray-500 text-sm">Cadastre os órgãos e contatos para envio.</p>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar cliente..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Import/Export Tools */}
                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200 w-full sm:w-auto justify-center">
                    <button 
                        onClick={handleExport}
                        title="Exportar CSV"
                        className="p-2 text-gray-600 hover:text-green-600 hover:bg-white rounded-md transition-all flex items-center gap-2 text-sm font-medium flex-1 justify-center"
                    >
                        <Download className="w-4 h-4" />
                        <span className="inline sm:hidden lg:inline">Exportar</span>
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button 
                        onClick={handleImportClick}
                        title="Importar CSV"
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-white rounded-md transition-all flex items-center gap-2 text-sm font-medium flex-1 justify-center"
                    >
                        <Upload className="w-4 h-4" />
                        <span className="inline sm:hidden lg:inline">Importar</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImport}
                        accept=".csv"
                        className="hidden"
                    />
                </div>

                {clients.length > 0 && (
                    <button 
                        onClick={onNext}
                        className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all"
                    >
                        Continuar
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>

        {/* Form */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Novo Cadastro</h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Sigla (Busca)</label>
                    <input 
                        type="text" 
                        placeholder="Ex: JFAL"
                        value={newClient.sigla}
                        onChange={e => setNewClient({...newClient, sigla: e.target.value})}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                    />
                </div>
                <div className="md:col-span-4">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome do Órgão (E-mail)</label>
                    <input 
                        type="text" 
                        placeholder="Ex: Justiça Federal de Alagoas"
                        value={newClient.name}
                        onChange={e => setNewClient({...newClient, name: e.target.value})}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                    />
                </div>
                <div className="md:col-span-4">
                    <label className="block text-xs font-medium text-gray-700 mb-1">E-mails (Destinatários)</label>
                    <input 
                        type="text" 
                        placeholder="nome@exemplo.com; outro@exemplo.com"
                        value={newClient.email}
                        onChange={e => setNewClient({...newClient, email: e.target.value})}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                    />
                </div>
                <div className="md:col-span-2">
                    <button 
                        onClick={handleAdd}
                        disabled={!newClient.sigla || !newClient.name || !newClient.email}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar
                    </button>
                </div>
            </div>
        </div>

        {/* List */}
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-white border-b border-gray-100">
                    <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Sigla</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Nome Completo</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Destinatários</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredClients.map(client => (
                        <tr key={client.id} className="hover:bg-gray-50 group">
                            <td className="px-6 py-4 font-bold text-gray-700 text-sm">{client.sigla}</td>
                            <td className="px-6 py-4 text-gray-700 text-sm">{client.name}</td>
                            <td className="px-6 py-4 text-gray-500 font-mono text-xs break-all">{client.email}</td>
                            <td className="px-6 py-4 text-right">
                                <button 
                                    onClick={() => handleDelete(client.id)}
                                    className="text-gray-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                                    title="Remover"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filteredClients.length === 0 && (
                        <tr>
                            <td colSpan={4} className="px-8 py-12 text-center text-gray-400">
                                <div className="flex flex-col items-center justify-center">
                                    <FileText className="w-8 h-8 text-gray-300 mb-2" />
                                    <p>Nenhum cliente encontrado.</p>
                                    {searchTerm && <p className="text-xs mt-1">Tente buscar por outro termo.</p>}
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
