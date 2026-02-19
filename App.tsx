
import React, { useState, useRef, useCallback } from 'react';
import { 
  Hammer, 
  Trash2,
  Table as TableIcon,
  FileSpreadsheet,
  Layers,
  Copy,
  CheckCircle2,
  FileCode2,
  Zap,
  HardHat,
  Droplets,
  ZapIcon,
  TreePine,
  Wrench,
  UploadCloud
} from 'lucide-react';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { Product, ProcessingStatus } from './types';
import { generateShopifyCopy } from './services/gemini';

const PersonaIcon = ({ persona }: { persona?: string }) => {
  switch (persona) {
    case 'Woodworker': return <TreePine size={14} className="text-amber-500" title="Master Woodworker" />;
    case 'Plumber': return <Droplets size={14} className="text-blue-500" title="Service Plumber" />;
    case 'Electrician': return <ZapIcon size={14} className="text-yellow-400" title="Industrial Electrician" />;
    case 'Heavy Civil': return <HardHat size={14} className="text-orange-500" title="Heavy Civil Contractor" />;
    case 'Tool Expert': return <Wrench size={14} className="text-emerald-500" title="TOH Tool Expert" />;
    default: return <Wrench size={14} className="text-gray-400" title="Tool Expert" />;
  }
};

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'bulk' | 'manual'>('manual');
  const [isDragging, setIsDragging] = useState(false);
  const [manualSku, setManualSku] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const abortControllerRef = useRef<boolean>(false);

  const parseCSV = (csvText: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') { currentCell += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.length > 0 || currentCell.length > 0) rows.push(currentRow);
        currentRow = []; currentCell = '';
      } else { currentCell += char; }
    }
    if (currentCell || currentRow.length > 0) { currentRow.push(currentCell.trim()); rows.push(currentRow); }
    return rows;
  };

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a valid CSV file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const allRows = parseCSV(e.target?.result as string);
      if (allRows.length === 0) return;
      const isHeader = allRows[0][0]?.toLowerCase().includes('sku');
      const dataRows = isHeader ? allRows.slice(1) : allRows;
      const newProducts: Product[] = dataRows.filter(row => row[0]?.trim()).map(row => ({
        id: Math.random().toString(36).substr(2, 9),
        sku: row[0].trim(),
        originalDescription: row[1] || '',
        status: 'pending' as const
      }));
      setProducts(prev => [...newProducts, ...prev]);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSku.trim()) return;
    const newProduct: Product = {
      id: Math.random().toString(36).substr(2, 9),
      sku: manualSku.trim(),
      originalDescription: manualDesc.trim(),
      status: 'processing'
    };
    setProducts(prev => [newProduct, ...prev]);
    setManualSku(''); setManualDesc('');
    try {
      const result = await generateShopifyCopy(newProduct.sku, newProduct.originalDescription);
      setProducts(prev => prev.map(p => p.id === newProduct.id ? { 
        ...p, status: 'completed', generatedCopy: result.html, generatedTitle: result.title, generatedTags: result.tags, personaUsed: result.personaUsed
      } : p));
    } catch (error: any) {
      setProducts(prev => prev.map(p => p.id === newProduct.id ? { ...p, status: 'error', error: error.message } : p));
    }
  };

  const processIndex = async (index: number) => {
    if (abortControllerRef.current) return;
    setProducts(prev => prev.map((p, i) => i === index ? { ...p, status: 'processing' } : p));
    try {
      const product = products[index];
      const result = await generateShopifyCopy(product.sku, product.originalDescription);
      setProducts(prev => prev.map((p, i) => i === index ? { 
        ...p, status: 'completed', generatedCopy: result.html, generatedTitle: result.title, generatedTags: result.tags, personaUsed: result.personaUsed, error: undefined 
      } : p));
    } catch (error: any) {
      setProducts(prev => prev.map((p, i) => i === index ? { ...p, status: 'error', error: error.message } : p));
    }
  };

  const processNext = useCallback(async (index: number) => {
    if (abortControllerRef.current || index >= products.length) {
      setStatus(ProcessingStatus.COMPLETED); setCurrentProcessingIndex(-1); return;
    }
    setCurrentProcessingIndex(index);
    if (products[index].status === 'completed' || products[index].status === 'processing') {
      processNext(index + 1); return;
    }
    await processIndex(index);
    if (!abortControllerRef.current) setTimeout(() => processNext(index + 1), 600);
  }, [products]);

  const startProcessing = () => {
    abortControllerRef.current = false; setStatus(ProcessingStatus.PROCESSING);
    const firstIndex = products.findIndex(p => p.status === 'pending' || p.status === 'error');
    if (firstIndex !== -1) processNext(firstIndex); else setStatus(ProcessingStatus.COMPLETED);
  };

  const stopProcessing = () => { abortControllerRef.current = true; setStatus(ProcessingStatus.CANCELLED); setCurrentProcessingIndex(-1); };
  const clearAll = () => { if (status !== ProcessingStatus.PROCESSING) { setProducts([]); setStatus(ProcessingStatus.IDLE); } };

  const downloadRawHTML = () => {
    const content = products.map(p => `[SKU: ${p.sku}]\n[TITLE: ${p.generatedTitle}]\n[TAGS: ${p.generatedTags}]\n-----------------\n${p.generatedCopy}\n\n`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ShopifyForge_${Date.now()}.txt`; a.click();
  };

  const downloadExcel = () => {
    const data = products.map(p => ({
      'Handle': (p.generatedTitle || p.sku).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      'Title': p.generatedTitle || '',
      'Body (HTML)': p.generatedCopy || '',
      'Tags': p.generatedTags || '',
      'SKU': p.sku,
      'Vendor': 'The Power Tool Store',
      'Status': 'active'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shopify Export");
    XLSX.writeFile(wb, `Shopify_Bulk_Import_${Date.now()}.xlsx`);
  };

  const copyTableForSheets = async () => {
    let html = `<table border="1"><thead><tr><th>SKU</th><th>Title</th><th>HTML</th><th>Tags</th></tr></thead><tbody>`;
    products.forEach(p => {
      html += `<tr><td>${p.sku}</td><td>${p.generatedTitle || ''}</td><td>${p.generatedCopy || ''}</td><td>${p.generatedTags || ''}</td></tr>`;
    });
    html += `</tbody></table>`;
    const blob = new Blob([html], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    alert('TABLE COPIED (TITLE + DESC + TAGS)');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white selection:bg-[#FCEE21] selection:text-black font-sans">
      <div className="h-2 w-full bg-[#FCEE21] bg-[repeating-linear-gradient(-45deg,#000,#000_15px,#FCEE21_15px,#FCEE21_30px)]"></div>
      
      <header className="bg-black border-b border-gray-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="bg-[#E31E24] p-3 transform -skew-x-12 border-2 border-[#FCEE21]/30">
              <Hammer size={24} className="text-white transform skew-x-12" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black italic uppercase leading-none tracking-tighter">
                POWER TOOL <span className="text-[#FCEE21]">FOUNDRY</span>
              </h1>
              <span className="text-[8px] font-black tracking-[0.4em] text-gray-600 uppercase">OFFICIAL SHOPIFY FORGE</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
             <div className="hidden md:flex bg-gray-900/50 p-1 border border-gray-800 rounded-sm">
                <button onClick={() => setActiveTab('manual')} className={`px-4 py-1.5 text-[9px] font-black uppercase ${activeTab === 'manual' ? 'bg-[#FCEE21] text-black' : 'text-gray-500'}`}>MANUAL</button>
                <button onClick={() => setActiveTab('bulk')} className={`px-4 py-1.5 text-[9px] font-black uppercase ${activeTab === 'bulk' ? 'bg-[#FCEE21] text-black' : 'text-gray-500'}`}>BULK</button>
             </div>
             <button onClick={clearAll} className="p-2 text-gray-600 hover:text-[#E31E24] transition-all"><Trash2 size={20} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="QUEUE" value={products.length} color="border-gray-800" />
          <StatCard label="FORGING" value={products.filter(p => p.status === 'processing').length} color="border-[#FCEE21]" />
          <StatCard label="COMPLETED" value={products.filter(p => p.status === 'completed').length} color="border-emerald-600" />
          <StatCard label="ERRORS" value={products.filter(p => p.status === 'error').length} color="border-[#E31E24]" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#0f0f0f] border border-gray-800 p-8 rounded-sm relative overflow-hidden flex flex-col min-h-[400px]">
            {activeTab === 'manual' ? (
              <form onSubmit={handleManualSubmit} className="space-y-6 relative z-10">
                <h2 className="text-xl font-black italic uppercase text-[#FCEE21] flex items-center gap-3"><Zap size={20} /> MANUAL FORGE</h2>
                <div className="space-y-4">
                  <input type="text" placeholder="UNIT SKU (REQUIRED)" value={manualSku} onChange={e => setManualSku(e.target.value)} className="w-full bg-black border border-gray-800 p-4 font-black italic text-[#FCEE21] uppercase outline-none focus:border-[#FCEE21]" />
                  <textarea placeholder="RAW DESCRIPTION (OPTIONAL - WILL SEARCH IF EMPTY)" rows={6} value={manualDesc} onChange={e => setManualDesc(e.target.value)} className="w-full bg-black border border-gray-800 p-4 text-gray-300 outline-none focus:border-[#FCEE21] resize-none"></textarea>
                </div>
                <button type="submit" disabled={!manualSku} className="w-full py-5 bg-[#E31E24] text-white font-black uppercase italic border-2 border-[#FCEE21] hover:bg-white hover:text-black transition-all shadow-[6px_6px_0px_#000]">FORGE UNIT</button>
              </form>
            ) : (
              <div className="h-full flex flex-col space-y-8 relative z-10">
                <h2 className="text-xl font-black italic uppercase text-[#FCEE21] flex items-center gap-3"><Layers size={20} /> BULK ASSEMBLY</h2>
                <div 
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`flex-1 border-2 border-dashed transition-all cursor-pointer relative ${
                    isDragging 
                    ? 'border-[#FCEE21] bg-[#FCEE21]/10 scale-[1.01]' 
                    : 'border-gray-800 hover:border-[#FCEE21]/50'
                  } flex flex-col items-center justify-center p-10 rounded-sm`}
                >
                  <label className="cursor-pointer text-center space-y-4 w-full h-full flex flex-col items-center justify-center">
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    {isDragging ? (
                      <UploadCloud size={48} className="mx-auto text-[#FCEE21] animate-bounce" />
                    ) : (
                      <FileSpreadsheet size={40} className="mx-auto text-gray-600" />
                    )}
                    <div className="space-y-1">
                      <p className={`font-black italic uppercase text-lg ${isDragging ? 'text-[#FCEE21]' : 'text-white'}`}>
                        {isDragging ? 'RELEASE TO FORGE' : 'DROP CSV OR CLICK TO BROWSE'}
                      </p>
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">COL A: SKU (REQ) | COL B: DESCRIPTION (OPTIONAL)</p>
                    </div>
                  </label>
                </div>
                <button onClick={status === ProcessingStatus.PROCESSING ? stopProcessing : startProcessing} disabled={products.length === 0} className={`w-full py-5 font-black uppercase ${status === ProcessingStatus.PROCESSING ? 'bg-orange-600 text-white' : 'bg-[#E31E24] text-white'} border-2 border-[#FCEE21] shadow-[6px_6px_0px_#000] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_#000] transition-all active:translate-y-[2px] active:shadow-[2px_2px_0px_#000]`}>
                  {status === ProcessingStatus.PROCESSING ? 'STOP PRODUCTION' : 'START PRODUCTION'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-[#0f0f0f] border border-gray-800 p-8 rounded-sm space-y-6">
            <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em]">EXPORT CENTER</h3>
            <div className="space-y-3">
              <ExportBtn onClick={downloadRawHTML} icon={<FileCode2 size={16}/>} label="RAW TEXT" />
              <ExportBtn onClick={downloadExcel} icon={<FileSpreadsheet size={16}/>} label="SHOPIFY EXCEL" />
              <ExportBtn onClick={copyTableForSheets} icon={<TableIcon size={16}/>} label="CLIPBOARD TABLE" />
            </div>
            <div className="p-4 bg-black/50 border border-gray-900 rounded-sm">
                 <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">ACCURACY GUARANTEE:</p>
                 <p className="text-[9px] text-gray-500 leading-relaxed italic">Missing descriptions are automatically retrieved from the Milwaukee tool catalog and official website using AI grounding.</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0f0f0f] border border-gray-800 rounded-sm">
          <div className="bg-black/90 px-8 py-5 border-b border-gray-900 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em] text-gray-500">
             PRODUCTION HISTORY
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-black/40 border-b border-gray-900 text-[9px] font-black text-gray-600 uppercase">
                  <th className="px-8 py-4">SKU / OPTIMIZED TITLE</th>
                  <th className="px-8 py-4">TRADE VOICE</th>
                  <th className="px-8 py-4">SEO TAGS</th>
                  <th className="px-8 py-4 text-right">INSPECT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {products.length === 0 ? (
                  <tr><td colSpan={4} className="px-8 py-32 text-center text-gray-700 font-black italic uppercase tracking-[0.6em]">Forge Idle...</td></tr>
                ) : (
                  products.map((p, idx) => (
                    <tr key={p.id} className={`${idx === currentProcessingIndex ? 'bg-[#FCEE21]/5' : ''} hover:bg-white/[0.02] transition-colors`}>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="font-black italic text-gray-200">{p.sku}</span>
                          <span className="text-[11px] text-[#FCEE21] uppercase font-bold truncate max-w-md">{p.generatedTitle || '---'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <PersonaIcon persona={p.personaUsed} />
                          <span className="text-[10px] font-black uppercase text-gray-500">{p.personaUsed || 'Pending'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="text-[9px] text-gray-600 truncate max-w-xs italic">{p.generatedTags || '---'}</div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {p.generatedCopy && <ResultModal product={p} />}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className={`p-6 bg-black border-l-4 ${color} transition-all hover:bg-[#111]`}>
    <p className="text-[8px] font-black text-gray-600 uppercase mb-2 tracking-widest">{label}</p>
    <p className="text-3xl font-black italic text-white">{value}</p>
  </div>
);

const ExportBtn = ({ onClick, icon, label }: { onClick: () => void, icon: any, label: string }) => (
  <button onClick={onClick} className="w-full px-6 py-4 bg-gray-900 border border-gray-800 text-[10px] font-black uppercase flex items-center gap-3 hover:bg-[#FCEE21] hover:text-black transition-all">
    {icon} {label}
  </button>
);

const ResultModal = ({ product }: { product: Product }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'preview' | 'code' | 'tags'>('preview');
  return (
    <>
      <button onClick={() => setIsOpen(true)} className="px-6 py-2 bg-[#FCEE21] text-black text-[10px] font-black uppercase transform -skew-x-12 border-2 border-black hover:bg-white transition-all shadow-[4px_4px_0px_#E31E24]">INSPECT</button>
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white text-black w-full max-w-5xl h-[90vh] flex flex-col border-[8px] border-black shadow-2xl">
            <div className="bg-black p-4 flex items-center justify-between text-white">
               <div className="flex items-center gap-4">
                 <div className="bg-[#E31E24] p-2 transform -skew-x-12"><PersonaIcon persona={product.personaUsed} /></div>
                 <span className="text-xs font-black uppercase tracking-tighter">{product.personaUsed} Context: {product.sku}</span>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => setView('preview')} className={`px-4 py-1 text-[9px] font-black ${view === 'preview' ? 'bg-[#FCEE21] text-black' : 'bg-gray-800'}`}>PREVIEW</button>
                 <button onClick={() => setView('code')} className={`px-4 py-1 text-[9px] font-black ${view === 'code' ? 'bg-[#FCEE21] text-black' : 'bg-gray-800'}`}>CODE</button>
                 <button onClick={() => setView('tags')} className={`px-4 py-1 text-[9px] font-black ${view === 'tags' ? 'bg-[#FCEE21] text-black' : 'bg-gray-800'}`}>TAGS</button>
                 <button onClick={() => setIsOpen(false)} className="px-4 py-1 text-[9px] font-black bg-white text-black">CLOSE</button>
               </div>
            </div>
            <div className="flex-1 overflow-auto p-10 bg-gray-50">
              <div className="bg-white border p-12 shadow-sm min-h-full max-w-4xl mx-auto">
                {view === 'preview' && <div className="text-left font-sans" dangerouslySetInnerHTML={{ __html: product.generatedCopy! }} />}
                {view === 'code' && <pre className="bg-black text-[#FCEE21] p-6 font-mono text-[11px] whitespace-pre-wrap">{product.generatedCopy}</pre>}
                {view === 'tags' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-gray-500">SEO Optimized Tags</p>
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 font-bold uppercase text-xs flex flex-wrap gap-2">
                      {product.generatedTags?.split(',').map(tag => (
                        <span key={tag} className="bg-white border border-emerald-200 px-2 py-1 rounded shadow-sm">{tag.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 bg-black flex justify-between items-center border-t border-gray-900">
               <div className="text-[9px] font-black text-white/40 uppercase tracking-widest italic flex items-center gap-2">
                 <CheckCircle2 size={14} className="text-emerald-500" /> UNIQUE FORGE COMPLETE
               </div>
               <button onClick={() => { navigator.clipboard.writeText(product.generatedCopy!); alert('COPIED'); }} className="px-12 py-4 bg-[#E31E24] text-white font-black uppercase text-xs border-2 border-[#FCEE21] transform -skew-x-12"><span className="transform skew-x-12 flex items-center gap-3"><Copy size={16}/> COPY FINAL HTML</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
