import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  MapPin, Plus, X, Search, Edit, Trash2, ShieldAlert, Filter, Layers, RefreshCw, CheckCircle,
  ChevronLeft, ChevronRight, ChevronDown, TreeDeciduous, Table, Upload, Download
} from 'lucide-react';

// TreeNode Component for rendering recursive tree rows
const TreeNode = ({ node, onEdit, onDelete, isSuperadmin, onAddChild, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  // Auto-expand if searchQuery is active and children match
  useEffect(() => {
    if (searchQuery && hasChildren) {
      const matchesSearch = node.children.some(child =>
        child.region_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchesSearch) {
        setIsExpanded(true);
      }
    }
  }, [searchQuery, hasChildren, node.children]);

  // Determine next level type
  const getNextLevelType = (type) => {
    if (type === 'Provinsi') return 'Kabupaten';
    if (type === 'Kabupaten') return 'Kecamatan';
    if (type === 'Kecamatan') return 'Desa';
    return '';
  };

  const nextType = getNextLevelType(node.region_type);

  // Check if current node name matches the search query
  const isMatch = searchQuery ? node.region_name.toLowerCase().includes(searchQuery.toLowerCase()) : true;

  return (
    <div className="my-1.5">
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-2xl border transition-all duration-150 gap-3
        ${isMatch ? 'bg-slate-900/40 hover:bg-slate-900/70 border-slate-800/80' : 'opacity-45 bg-slate-950/20 border-slate-900/50'}
      `}>
        <div className="flex items-center space-x-2.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 transition-transform active:scale-95"
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="p-1.5 bg-slate-950 rounded-lg border border-slate-800/60 flex-shrink-0">
            <MapPin className={`h-3.5 w-3.5 ${node.region_type === 'Provinsi' ? 'text-violet-400' :
              node.region_type === 'Kabupaten' ? 'text-indigo-400' :
                node.region_type === 'Kecamatan' ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>

          <div className="truncate">
            <span className="font-bold text-slate-200 text-xs sm:text-sm tracking-tight">{node.region_name}</span>
            <span className="text-[10px] text-slate-600 font-mono font-bold block leading-none mt-1">ID: {node.id}</span>
          </div>

          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider
            ${node.region_type === 'Provinsi' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/15' :
              node.region_type === 'Kabupaten' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' :
                node.region_type === 'Kecamatan' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' :
                  'bg-amber-500/10 text-amber-400 border border-amber-500/15'}`}
          >
            {node.region_type}
          </span>
        </div>

        <div className="flex items-center justify-end space-x-2 self-end sm:self-center">
          {isSuperadmin && nextType && (
            <button
              onClick={() => onAddChild(node)}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 rounded-xl text-[10px] font-bold transition-all"
              title={`Tambah ${nextType} di bawah ${node.region_name}`}
            >
              <Plus className="h-3 w-3" />
              <span>Tambah {nextType}</span>
            </button>
          )}

          {isSuperadmin && (
            <div className="flex items-center space-x-1 border-l border-slate-800 pl-2">
              <button
                onClick={() => onEdit(node)}
                className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                title="Edit Wilayah"
              >
                <Edit className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(node.id)}
                className="p-1.5 hover:bg-rose-950/20 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
                title="Hapus Wilayah"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="pl-6 md:pl-8 border-l border-slate-800/80 ml-5 mt-1 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onDelete={onDelete}
              isSuperadmin={isSuperadmin}
              onAddChild={onAddChild}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Regions = () => {
  const { activeRole } = useAuth();
  const isSuperadmin = activeRole === 'Superadmin';

  // Toggle View modes: 'tree' or 'table'
  const [viewMode, setViewMode] = useState('tree');

  // Core list states
  const [regions, setRegions] = useState([]);
  const [treeRoots, setTreeRoots] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Feedbacks
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('Provinsi');
  const [createRef, setCreateRef] = useState('');
  const [parentCandidates, setParentCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  // Edit Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('Provinsi');
  const [editRef, setEditRef] = useState('');

  // Import CSV states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [parsedRegions, setParsedRegions] = useState([]);
  const [importResults, setImportResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  // Build recursive tree from flat array list
  const constructTree = (flatList) => {
    const map = {};
    const roots = [];

    flatList.forEach(item => {
      map[item.id] = { ...item, children: [] };
    });

    flatList.forEach(item => {
      const mapped = map[item.id];
      if (item.region_ref && map[item.region_ref]) {
        map[item.region_ref].children.push(mapped);
      } else {
        roots.push(mapped);
      }
    });

    return roots;
  };

  // Fetch regions list
  const fetchRegions = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // In Tree view, we fetch larger chunks to build full hierarchy client side
      const params = {
        page: viewMode === 'tree' ? 1 : currentPage,
        limit: viewMode === 'tree' ? 1000 : limit,
      };
      if (filterType && viewMode === 'table') {
        params.region_type = filterType;
      }

      const response = await axios.get('/api/regions', { params });
      if (response.data && response.data.status === 'success') {
        const listData = response.data.data || [];
        setRegions(listData);
        setTreeRoots(constructTree(listData));

        if (response.data.pagination) {
          setTotalItems(response.data.pagination.totalItems);
          setTotalPages(response.data.pagination.totalPages);
        } else {
          setTotalItems(listData.length);
        }
      }
    } catch (err) {
      console.error("Failed to load regions:", err);
      setErrorMessage(err.response?.data?.message || 'Gagal memuat data wilayah.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegions();
  }, [currentPage, filterType, viewMode]);

  // Load suitable parent candidates based on chosen region type
  const loadParentCandidates = async (chosenType) => {
    let targetParentType = '';
    if (chosenType === 'Kabupaten') targetParentType = 'Provinsi';
    else if (chosenType === 'Kecamatan') targetParentType = 'Kabupaten';
    else if (chosenType === 'Desa') targetParentType = 'Kecamatan';

    if (!targetParentType) {
      setParentCandidates([]);
      return;
    }

    setCandidatesLoading(true);
    try {
      const res = await axios.get('/api/regions', {
        params: { region_type: targetParentType, limit: 1000 }
      });
      if (res.data && res.data.status === 'success') {
        const list = res.data.data || [];
        setParentCandidates(list);
        if (list.length > 0) {
          setCreateRef(list[0].id.toString());
          setEditRef(list[0].id.toString());
        } else {
          setCreateRef('');
          setEditRef('');
        }
      }
    } catch (err) {
      console.error("Failed to fetch parent candidates:", err);
    } finally {
      setCandidatesLoading(false);
    }
  };

  // Helper when clicking "Tambah Sub-Wilayah" under a node
  const handleAddChildClick = (parentNode) => {
    const nextLevels = {
      'Provinsi': 'Kabupaten',
      'Kabupaten': 'Kecamatan',
      'Kecamatan': 'Desa'
    };

    const targetType = nextLevels[parentNode.region_type] || 'Desa';
    setCreateType(targetType);
    setCreateName('');
    setCreateRef(parentNode.id.toString());
    setIsCreateModalOpen(true);
  };

  useEffect(() => {
    if (isCreateModalOpen) {
      loadParentCandidates(createType);
    }
  }, [createType, isCreateModalOpen]);

  useEffect(() => {
    if (isEditModalOpen) {
      loadParentCandidates(editType);
    }
  }, [editType, isEditModalOpen]);

  // Handle Create Submit
  const handleCreateRegion = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!createName) {
      setErrorMessage('Nama wilayah harus diisi!');
      return;
    }

    try {
      const payload = {
        region_name: createName,
        region_type: createType,
        region_ref: createType === 'Provinsi' ? null : (createRef ? parseInt(createRef, 10) : null)
      };

      const res = await axios.post('/api/regions', payload);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('Wilayah baru berhasil ditambahkan!');
        setIsCreateModalOpen(false);
        setCreateName('');
        setCreateType('Provinsi');
        setCreateRef('');
        setCurrentPage(1);
        fetchRegions();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal menambahkan wilayah baru.');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (region) => {
    setEditingId(region.id);
    setEditName(region.region_name);
    setEditType(region.region_type);
    setEditRef(region.region_ref ? region.region_ref.toString() : '');
    setIsEditModalOpen(true);
  };

  // Handle Edit Submit
  const handleUpdateRegion = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        region_name: editName,
        region_type: editType,
        region_ref: editType === 'Provinsi' ? null : (editRef ? parseInt(editRef, 10) : null)
      };

      const res = await axios.put(`/api/regions/${editingId}`, payload);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('Wilayah berhasil diperbarui!');
        setIsEditModalOpen(false);
        fetchRegions();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal mengubah data wilayah.');
    }
  };

  // Handle Delete
  const handleDeleteRegion = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus wilayah ini? Seluruh sub-wilayah di bawahnya harus dihapus terlebih dahulu.')) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await axios.delete(`/api/regions/${id}`);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('Wilayah berhasil dihapus.');
        fetchRegions();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal menghapus wilayah.');
    }
  };

  // Client side static template file trigger download
  const handleDownloadTemplate = () => {
    const headers = 'region_name,region_type,parent_name\n';
    const rows = [
      'Kalimantan Barat,Provinsi,',
      'Kota Pontianak,Kabupaten,Kalimantan Barat',
      'Kecamatan Pontianak Selatan,Kecamatan,Kota Pontianak',
      'Kelurahan Parit Tokaya,Desa,Kecamatan Pontianak Selatan'
    ].join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'format_import_regions.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // File uploading handler parsing CSV
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);
    setImportError('');
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      try {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          throw new Error('File CSV kosong atau tidak memiliki baris data.');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf('region_name');
        const typeIdx = headers.indexOf('region_type');
        const parentIdx = headers.indexOf('parent_name');

        if (nameIdx === -1 || typeIdx === -1) {
          throw new Error('Format CSV salah. Kolom "region_name" dan "region_type" wajib disertakan.');
        }

        const list = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Split by commas while respecting potential quotes
          const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 2) continue;

          list.push({
            region_name: cols[nameIdx] || '',
            region_type: cols[typeIdx] || '',
            parent_name: parentIdx !== -1 ? (cols[parentIdx] || '') : ''
          });
        }

        setParsedRegions(list);
      } catch (err) {
        setImportError(err.message);
        setParsedRegions([]);
      }
    };
    reader.readAsText(file);
  };

  // Upload parsed array to API backend
  const handleImportSubmit = async () => {
    if (parsedRegions.length === 0) {
      setImportError('Tidak ada wilayah valid untuk diunggah.');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportResults(null);

    try {
      const res = await axios.post('/api/regions/import', { regions: parsedRegions });
      if (res.data && res.data.status === 'success') {
        setImportResults(res.data.data);
        fetchRegions();
      }
    } catch (err) {
      setImportError(err.response?.data?.message || 'Gagal mengunggah file CSV.');
    } finally {
      setImporting(false);
    }
  };

  // Close Import Modal
  const closeImportModal = () => {
    setIsImportModalOpen(false);
    setCsvFile(null);
    setParsedRegions([]);
    setImportResults(null);
    setImportError('');
  };

  // Filter lists based on search
  const filteredFlatRegions = regions.filter(r =>
    r.region_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.parent_name && r.parent_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0 flex items-center space-x-2">
            <span>Daftar</span> <span className="gradient-text-primary">Wilayah</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Daerah Administratif Layanan ISP.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Toggle View mode */}
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-800/80 flex items-center space-x-1">
            <button
              type="button"
              onClick={() => {
                setViewMode('tree');
                setFilterType('');
              }}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${viewMode === 'tree' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              title="Tree View"
            >
              <TreeDeciduous className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Struktur Pohon</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${viewMode === 'table' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              title="Table View"
            >
              <Table className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Data Tabel</span>
            </button>
          </div>

          {isSuperadmin && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center space-x-1 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                <Upload className="h-4 w-4 text-brand-400" />
                <span>Import CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateType('Provinsi');
                  setCreateName('');
                  setCreateRef('');
                  setIsCreateModalOpen(true);
                }}
                className="flex items-center space-x-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-brand-500/15"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Provinsi</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner message alerts */}
      {errorMessage && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Control panel: filter and search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative col-span-1 md:col-span-2">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Ketik kata kunci untuk menyaring nama wilayah..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full input-field pl-10 text-xs"
          />
        </div>

        {viewMode === 'table' ? (
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
              className="input-field select-field text-xs py-2 w-full"
            >
              <option value="">Semua Tingkatan Wilayah</option>
              <option value="Provinsi">Provinsi</option>
              <option value="Kabupaten">Kabupaten</option>
              <option value="Kecamatan">Kecamatan</option>
              <option value="Desa">Desa</option>
            </select>
          </div>
        ) : (
          <div className="flex justify-end items-center text-[11px] text-slate-500 font-semibold bg-slate-900/40 border border-slate-800/60 px-4 py-2 rounded-xl">
            <Layers className="h-4 w-4 text-brand-400 mr-2" />
            <span>Total: {totalItems} entitas wilayah terdaftar</span>
          </div>
        )}
      </div>

      {/* VIEW: INTERACTIVE TREE VIEW */}
      {viewMode === 'tree' && (
        <div className="glass-panel p-6 space-y-3 min-h-[300px]">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-brand-400 mb-2" />
              <span>Menyusun struktur pohon hierarki...</span>
            </div>
          ) : treeRoots.length > 0 ? (
            <div className="space-y-1">
              {treeRoots.map(root => (
                <TreeNode
                  key={root.id}
                  node={root}
                  onEdit={handleOpenEdit}
                  onDelete={handleDeleteRegion}
                  isSuperadmin={isSuperadmin}
                  onAddChild={handleAddChildClick}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada wilayah yang terdaftar. Gunakan tombol "Tambah Provinsi" di atas untuk memulai struktur.
            </div>
          )}
        </div>
      )}

      {/* VIEW: STANDARD TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="glass-panel p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/25 sticky top-0 backdrop-blur">
                  <th className="py-3 px-4 font-semibold">ID</th>
                  <th className="py-3 px-4 font-semibold">Nama Wilayah</th>
                  <th className="py-3 px-4 font-semibold">Tipe Tingkat</th>
                  <th className="py-3 px-4 font-semibold">Induk Wilayah (Parent)</th>
                  {isSuperadmin && <th className="py-3 px-4 font-semibold text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {loading ? (
                  <tr>
                    <td colSpan={isSuperadmin ? "5" : "4"} className="py-8 text-center text-xs text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-brand-400 mb-2" />
                      <span>Sedang menyinkronkan data...</span>
                    </td>
                  </tr>
                ) : filteredFlatRegions.length > 0 ? (
                  filteredFlatRegions.map((region) => (
                    <tr key={region.id} className="hover:bg-slate-800/10">
                      <td className="py-3 px-4 font-bold text-slate-500 font-mono">{region.id}</td>
                      <td className="py-3 px-4 font-bold text-slate-200">
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-500" />
                          <span>{region.region_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold 
                          ${region.region_type === 'Provinsi' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/15' :
                            region.region_type === 'Kabupaten' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' :
                              region.region_type === 'Kecamatan' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' :
                                'bg-amber-500/10 text-amber-400 border border-amber-500/15'}`}
                        >
                          {region.region_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {region.parent_name ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] text-slate-600 font-bold uppercase font-mono">[{region.region_ref}]</span>
                            <span>{region.parent_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600 italic">Pusat Core (No Parent)</span>
                        )}
                      </td>
                      {isSuperadmin && (
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleOpenEdit(region)}
                              className="p-1 hover:bg-slate-900 rounded text-slate-400 hover:text-white transition-colors"
                              title="Edit Wilayah"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRegion(region.id)}
                              className="p-1 hover:bg-rose-950/30 rounded text-slate-400 hover:text-rose-400 transition-colors"
                              title="Hapus Wilayah"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isSuperadmin ? "5" : "4"} className="py-8 text-center text-xs text-slate-500">
                      Tidak ada data wilayah ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800/60 pt-4 mt-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Halaman {currentPage} dari {totalPages}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-slate-800 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-white disabled:opacity-40 transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-slate-800 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-white disabled:opacity-40 transition-all"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: IMPORT CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-lg p-6 relative flex flex-col space-y-4">
            <button
              onClick={closeImportModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Upload className="h-5 w-5 text-brand-400" />
              <h3 className="text-base font-bold text-slate-200">Import Wilayah via CSV</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-300 block mb-0.5">Template CSV Default</span>
                  <span className="text-[10px] text-slate-500 block">Gunakan file template dengan susunan kolom standar.</span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-[10px] font-bold transition-all"
                >
                  <Download className="h-3.5 w-3.5 text-brand-400" />
                  <span>Download Format CSV</span>
                </button>
              </div>

              {/* Drag/drop selector */}
              <div className="border-2 border-dashed border-slate-800/80 hover:border-brand-500/40 rounded-2xl p-6 text-center transition-colors cursor-pointer relative bg-slate-950/30">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <span className="font-bold text-slate-300 block">
                  {csvFile ? csvFile.name : 'Pilih file CSV Anda'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Maksimal file size 5MB (.csv saja)
                </span>
              </div>

              {importError && (
                <div className="bg-rose-500/10 border border-rose-500/15 p-3 rounded-xl text-[10px] text-rose-400 font-semibold leading-relaxed">
                  {importError}
                </div>
              )}

              {parsedRegions.length > 0 && !importResults && (
                <div className="bg-brand-500/10 border border-brand-500/15 p-3 rounded-xl flex justify-between items-center text-[10px] text-brand-400 font-bold">
                  <span>Terdeteksi {parsedRegions.length} entitas wilayah siap diproses.</span>
                </div>
              )}

              {/* Import completed results report */}
              {importResults && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="bg-emerald-500/10 border border-emerald-500/15 p-3.5 rounded-xl flex items-start space-x-2.5 text-[10px] text-emerald-400">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <span className="font-bold block">Import Wilayah Selesai!</span>
                      <span className="block mt-0.5">Sistem sukses menyisipkan <strong>{importResults.successCount}</strong> entitas wilayah baru ke database.</span>
                    </div>
                  </div>

                  {importResults.errors && importResults.errors.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Log Diagnostic Peringatan ({importResults.errors.length}):</span>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 max-h-[120px] overflow-y-auto space-y-1 text-[10px] font-mono text-slate-400">
                        {importResults.errors.map((err, idx) => (
                          <div key={idx} className="flex items-start space-x-1.5 border-b border-slate-800/40 pb-1 last:border-0 last:pb-0">
                            <span className="text-amber-500">⚠</span>
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Tutup
                </button>
                {parsedRegions.length > 0 && !importResults && (
                  <button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={importing}
                    className="flex items-center space-x-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-600/15 disabled:opacity-40"
                  >
                    {importing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>{importing ? 'Sedang Mengunggah...' : 'Unggah Wilayah'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE REGION */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 relative flex flex-col space-y-4">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <MapPin className="h-5 w-5 text-brand-400" />
              <h3 className="text-base font-bold text-slate-200">Tambah Wilayah</h3>
            </div>

            <form onSubmit={handleCreateRegion} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Wilayah / Region</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Kabupaten Pontianak"
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tingkatan Wilayah</label>
                <select
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                  className="w-full input-field select-field"
                >
                  <option value="Provinsi">Provinsi</option>
                  <option value="Kabupaten">Kabupaten</option>
                  <option value="Kecamatan">Kecamatan</option>
                  <option value="Desa">Desa</option>
                </select>
              </div>

              {createType !== 'Provinsi' && (
                <div className="space-y-1 animate-in slide-in-from-top-2 duration-150">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between items-center">
                    <span>Pilih Induk Wilayah ({createType === 'Kabupaten' ? 'Provinsi' : createType === 'Kecamatan' ? 'Kabupaten' : 'Kecamatan'})</span>
                    {candidatesLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin text-brand-400" />}
                  </label>
                  <select
                    value={createRef}
                    onChange={(e) => setCreateRef(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {parentCandidates.length > 0 ? (
                      parentCandidates.map(p => (
                        <option key={p.id} value={p.id}>{p.region_name}</option>
                      ))
                    ) : (
                      <option value="" disabled>-- Tidak ada induk yang cocok tersedia --</option>
                    )}
                  </select>
                </div>
              )}

              {createType !== 'Provinsi' && parentCandidates.length === 0 && !candidatesLoading && (
                <div className="bg-amber-500/10 border border-amber-500/15 p-3 rounded-xl flex items-start space-x-2 text-[10px] text-amber-400">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  <span>Harap buat wilayah induk bertipe <strong>{createType === 'Kabupaten' ? 'Provinsi' : createType === 'Kecamatan' ? 'Kabupaten' : 'Kecamatan'}</strong> terlebih dahulu.</span>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createType !== 'Provinsi' && parentCandidates.length === 0}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-xl font-bold text-white shadow-lg shadow-brand-600/15 disabled:opacity-40"
                >
                  Simpan Wilayah
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT REGION */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 relative flex flex-col space-y-4">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <MapPin className="h-5 w-5 text-indigo-400" />
              <h3 className="text-base font-bold text-slate-200">Ubah Wilayah</h3>
            </div>

            <form onSubmit={handleUpdateRegion} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Wilayah / Region</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tingkatan Wilayah</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full input-field select-field"
                >
                  <option value="Provinsi">Provinsi</option>
                  <option value="Kabupaten">Kabupaten</option>
                  <option value="Kecamatan">Kecamatan</option>
                  <option value="Desa">Desa</option>
                </select>
              </div>

              {editType !== 'Provinsi' && (
                <div className="space-y-1 animate-in slide-in-from-top-2 duration-150">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between items-center">
                    <span>Pilih Induk Wilayah ({editType === 'Kabupaten' ? 'Provinsi' : editType === 'Kecamatan' ? 'Kabupaten' : 'Kecamatan'})</span>
                    {candidatesLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin text-brand-400" />}
                  </label>
                  <select
                    value={editRef}
                    onChange={(e) => setEditRef(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {parentCandidates.length > 0 ? (
                      parentCandidates.map(p => (
                        <option key={p.id} value={p.id}>{p.region_name}</option>
                      ))
                    ) : (
                      <option value="" disabled>-- Tidak ada induk yang cocok tersedia --</option>
                    )}
                  </select>
                </div>
              )}

              {editType !== 'Provinsi' && parentCandidates.length === 0 && !candidatesLoading && (
                <div className="bg-amber-500/10 border border-amber-500/15 p-3 rounded-xl flex items-start space-x-2 text-[10px] text-amber-400">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  <span>Harap buat wilayah induk bertipe <strong>{editType === 'Kabupaten' ? 'Provinsi' : editType === 'Kecamatan' ? 'Kabupaten' : 'Kecamatan'}</strong> terlebih dahulu.</span>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editType !== 'Provinsi' && parentCandidates.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white shadow-lg shadow-indigo-600/15 disabled:opacity-40"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Regions;
