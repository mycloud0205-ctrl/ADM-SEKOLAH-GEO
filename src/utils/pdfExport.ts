import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatHariTanggal, getTodayWIB } from '../shared/scheduleConstants';
import type {
  KehadiranSiswaRecord,
  PembinaanRecord,
  PengaturanSekolah,
  SiswaRecord,
} from '../shared/types';

function addSchoolHeader(
  doc: jsPDF,
  pengaturan: PengaturanSekolah,
  title: string,
  subtitle: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const nama = pengaturan?.namaSekolah || 'SMK KP BALEENDAH';
  const alamat = pengaturan?.alamatSekolah || 'Jl. Adipati Agung No. 32 Baleendah - Kab. Bandung';

  doc.setFillColor(30, 41, 59);
  doc.rect(14, 12, pageWidth - 28, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(nama.toUpperCase(), pageWidth / 2, 21, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(alamat, pageWidth / 2, 28, { align: 'center' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title.toUpperCase(), pageWidth / 2, 43, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, pageWidth / 2, 49, { align: 'center' });

  return 55;
}

export function downloadRekapAbsensiSiswaPdf(
  pengaturan: PengaturanSekolah,
  siswaList: SiswaRecord[],
  kehadiran: KehadiranSiswaRecord[],
  filterKelas: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const filteredSiswa = filterKelas ? siswaList.filter((s) => s.kelas === filterKelas) : siswaList;
  const todayStr = getTodayWIB();

  const startY = addSchoolHeader(
    doc,
    pengaturan,
    'Rekapitulasi Presensi Kehadiran Siswa',
    `Kelas: ${filterKelas || 'Semua Kelas'}  |  Tanggal Cetak: ${formatHariTanggal(todayStr)}`
  );

  const rows = filteredSiswa.map((s, idx) => {
    const logs = kehadiran.filter((k) => k.nis === s.nis);
    const h = logs.filter((k) => k.status === 'Hadir').length;
    const tr = logs.filter((k) => k.status === 'Terlambat').length;
    const sk = logs.filter((k) => k.status === 'Sakit').length;
    const iz = logs.filter((k) => k.status === 'Izin').length;
    const al = logs.filter((k) => k.status === 'Alpa').length;
    const pct = logs.length > 0 ? Math.round(((h + tr) / logs.length) * 100) : 0;
    return [idx + 1, s.nis, s.nama, s.kelas, h, tr, iz, sk, al, `${pct}%`];
  });

  autoTable(doc, {
    startY,
    head: [['No', 'NIS', 'Nama Siswa', 'Kelas', 'Hadir', 'Terlambat', 'Ijin', 'Sakit', 'Alpha', 'Persentase']],
    body: rows.length > 0 ? rows : [['-', '-', 'Tidak ada data siswa', '-', 0, 0, 0, 0, 0, '0%']],
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' },
      7: { halign: 'center' },
      8: { halign: 'center' },
      9: { halign: 'center', fontStyle: 'bold' },
    },
  });

  const safeKelas = (filterKelas || 'Semua_Kelas').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Rekap_Presensi_${safeKelas}_${todayStr}.pdf`);
}

export function downloadPembinaanPdf(
  pengaturan: PengaturanSekolah,
  pembinaan: PembinaanRecord[],
  filterKelas: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const filtered = filterKelas ? pembinaan.filter((p) => p.kelas === filterKelas) : pembinaan;
  const todayStr = getTodayWIB();

  const startY = addSchoolHeader(
    doc,
    pengaturan,
    'Laporan Riwayat Pembinaan & Bimbingan Konseling Siswa',
    `Kelas: ${filterKelas || 'Semua Kelas'}  |  Tanggal Cetak: ${formatHariTanggal(todayStr)}`
  );

  const rows = filtered.map((p, idx) => [
    idx + 1,
    formatHariTanggal(p.tanggal),
    p.nis,
    p.nama,
    p.kelas,
    p.jenis,
    p.poin,
    p.uraian,
    p.solusi,
  ]);

  autoTable(doc, {
    startY,
    head: [['No', 'Tanggal', 'NIS', 'Nama Siswa', 'Kelas', 'Kategori', 'Poin', 'Uraian Permasalahan', 'Solusi / Tindak Lanjut']],
    body: rows.length > 0 ? rows : [['-', '-', '-', 'Belum ada riwayat pembinaan', '-', '-', 0, '-', '-']],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      4: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
    },
  });

  const safeKelas = (filterKelas || 'Semua_Kelas').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Riwayat_Pembinaan_${safeKelas}_${todayStr}.pdf`);
}
