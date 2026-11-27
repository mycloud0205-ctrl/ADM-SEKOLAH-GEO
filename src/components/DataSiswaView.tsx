import React, { useMemo, useState } from 'react';
import { Layers, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { apiRequest } from '../utils/api';
import type { AuthUser, SiswaRecord } from '../shared/types';

interface DataSiswaViewProps {
  user: AuthUser;
  siswa: SiswaRecord[];
  onRefresh: () => Promise<void>;
}

const EMPTY_FORM = {
  id: 0,
  nis: '',
  nama: '',
  kelas: '',
  jurusan: '',
  jk: 'L',
  tempatPkl: '-',
  nilaiSm1: '-',
  nilaiSm2: '-',
  statusSm1: 'Tuntas',
  statusSm2: 'Tuntas',
  tugasBelumSm1: '-',
  tugasBelumSm2: '-',
};

export const DataSiswaView: React.FC<DataSiswaViewProps> = ({ user, siswa, onRefresh }) => {
  const [filterKelas, setFilterKelas] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAdmin = user.role === 'admin';

  const kelasList = useMemo(() => {
    const s = new Set(siswa.map((x) => x.kelas).filter(Boolean));
    return Array.from(s).sort();
  }, [siswa]);

  const filteredSiswa = useMemo(() => {
    const q = search.trim().toLowerCase();
    return siswa.filter((s) => {
      const matchKls = !filterKelas || s.kelas === filterKelas;
      const matchSearch = !q || s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
      return matchKls && matchSearch;
    });
  }, [siswa, filterKelas, search]);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (item: SiswaRecord) => {
    setForm({
      id: item.id,
      nis: item.nis,
      nama: item.nama,
      kelas: item.kelas,
      jurusan: item.jurusan,
      jk: item.jk,
      tempatPkl: item.tempatPkl,
      nilaiSm1: item.nilaiSm1,
      nilaiSm2: item.nilaiSm2,
      statusSm1: item.statusSm1,
      statusSm2: item.statusSm2,
      tugasBelumSm1: item.tugasBelumSm1,
      tugasBelumSm2: item.tugasBelumSm2,
    });
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      if (form.id) {
        await apiRequest(`/api/siswa/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiRequest('/api/siswa', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: SiswaRecord) => {
    if (!isAdmin) return;
    await apiRequest(`/api/siswa/${item.id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const handleUploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    setImportingCsv(true);
    setImportNotice(null);
    try {
      const csvContent = await file.text();
      const res = await apiRequest<{ message: string }>('/api/admin/import-siswa-csv', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });
      setImportNotice(res.message);
      await onRefresh();
    } catch (err) {
      setImportNotice(err instanceof Error ? err.message : 'Gagal mengimpor CSV.');
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rekap Jumlah Siswa Per Kelas */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Rekap Kelas (Jumlah Siswa)</h3>
          </div>
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
            Total {siswa.length} Siswa
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {kelasList.map((k) => {
            const list = siswa.filter((s) => s.kelas === k);
            const l = list.filter((s) => s.jk.toUpperCase() === 'L').length;
            const p = list.filter((s) => s.jk.toUpperCase() === 'P').length;
            const active = filterKelas === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilterKelas(active ? '' : k)}
                className={`p-3.5 rounded-xl border text-left transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-indigo-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white">{k}</div>
                <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                  {list.length} Siswa
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  L: {l} · P: {p}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Daftar Data Siswa Sekolah */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Daftar Data Siswa Sekolah</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="">Semua Kelas</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari NIS / Nama..."
                className="pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            {isAdmin && (
              <>
                <label className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{importingCsv ? 'Mengimpor...' : 'Import CSV'}</span>
                  <input type="file" accept=".csv,text/csv" onChange={handleUploadCsv} className="sr-only" />
                </label>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Siswa</span>
                </button>
              </>
            )}
          </div>
        </div>

        {importNotice && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {importNotice}
          </div>
        )}

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3 w-12">No</th>
                <th className="p-3">NIS</th>
                <th className="p-3">Nama Siswa</th>
                <th className="p-3">Kelas</th>
                <th className="p-3">Jurusan</th>
                <th className="p-3 text-center">JK</th>
                {isAdmin && <th className="p-3 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredSiswa.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="p-8 text-center text-slate-500">
                    Tidak ada data siswa yang cocok.
                  </td>
                </tr>
              ) : (
                filteredSiswa.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 tabular-nums">{idx + 1}</td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{s.nis}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{s.nama}</td>
                    <td className="p-3">{s.kelas}</td>
                    <td className="p-3">{s.jurusan}</td>
                    <td className="p-3 text-center">{s.jk}</td>
                    {isAdmin && (
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold inline-flex items-center gap-1 hover:bg-blue-100"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Update</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold inline-flex items-center gap-1 hover:bg-rose-100"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Update Siswa (Admin Only) */}
      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {form.id ? 'Update Data Siswa' : 'Tambah Siswa Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    NIS *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nis}
                    onChange={(e) => setForm({ ...form, nis: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nama}
                    onChange={(e) => setForm({ ...form, nama: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kelas *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.kelas}
                    onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                    placeholder="Contoh: X TJKT 1"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Jurusan *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.jurusan}
                    onChange={(e) => setForm({ ...form, jurusan: e.target.value })}
                    placeholder="Contoh: TJKT"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={form.jk}
                    onChange={(e) => setForm({ ...form, jk: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="L">Laki-Laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tempat PKL
                  </label>
                  <input
                    type="text"
                    value={form.tempatPkl}
                    onChange={(e) => setForm({ ...form, tempatPkl: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nilai Semester 1
                  </label>
                  <input
                    type="text"
                    value={form.nilaiSm1}
                    onChange={(e) => setForm({ ...form, nilaiSm1: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nilai Semester 2
                  </label>
                  <input
                    type="text"
                    value={form.nilaiSm2}
                    onChange={(e) => setForm({ ...form, nilaiSm2: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Status SM 1
                  </label>
                  <input
                    type="text"
                    value={form.statusSm1}
                    onChange={(e) => setForm({ ...form, statusSm1: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Status SM 2
                  </label>
                  <input
                    type="text"
                    value={form.statusSm2}
                    onChange={(e) => setForm({ ...form, statusSm2: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Data Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
