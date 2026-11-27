import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return supabaseClient;
}

export async function syncRecordToSupabase(table: string, row: Record<string, unknown>): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from(table).upsert(row);
  } catch (err) {
    console.warn(`Supabase sync skipped for ${table}:`, err instanceof Error ? err.message : err);
  }
}

export const SUPABASE_SQL_SCHEMA = `-- Skema PostgreSQL & Real-Time Supabase untuk Sistem Integrasi Sekolah
-- Jalankan di SQL Editor pada Dashboard Supabase Anda (Free Tier Ready)

create table if not exists pengaturan (
  id int primary key default 1,
  nama_sekolah text not null,
  alamat_sekolah text not null,
  tahun_ajaran text not null,
  nama_walikelas text,
  kelas_ampu text,
  lat_gps double precision default -7.001759,
  lng_gps double precision default 107.623047,
  radius_meter int default 100,
  footer_app text,
  logo_sekolah text
);

create table if not exists siswa (
  id bigserial primary key,
  nis text unique not null,
  nama text not null,
  kelas text not null,
  jurusan text not null,
  jk text not null default 'L',
  tempat_pkl text default '-',
  nilai_sm1 text default '-',
  nilai_sm2 text default '-',
  status_sm1 text default '-',
  status_sm2 text default '-',
  tugas_belum_sm1 text default '-',
  tugas_belum_sm2 text default '-'
);

create table if not exists kehadiran_siswa (
  id bigserial primary key,
  tgl_absen text not null,
  waktu_input text not null,
  nis text not null,
  nama text not null,
  kelas text not null,
  jurusan text,
  jk text,
  status text not null,
  jarak_meter text,
  unique(tgl_absen, nis)
);

create table if not exists kehadiran_pegawai (
  id bigserial primary key,
  tgl_absen text not null,
  waktu_input text not null,
  nip_user text not null,
  nama text not null,
  role_jabatan text not null,
  jk text,
  status text not null,
  jarak_meter text,
  unique(tgl_absen, nip_user)
);

create table if not exists jadwal_pelajaran (
  id bigserial primary key,
  hari text not null,
  jam text not null,
  kelas text not null,
  mapel text not null,
  guru text not null,
  ruang text
);

create table if not exists jurnal_harian (
  id bigserial primary key,
  waktu_input text not null,
  tanggal text not null,
  guru_nama text not null,
  jam_ke text not null,
  kelas text not null,
  mapel text not null,
  tujuan text,
  materi text not null,
  metode text,
  refleksi text,
  tugas text,
  nilai_progres text,
  foto_url text
);

create table if not exists pembinaan_siswa (
  id bigserial primary key,
  waktu_input text not null,
  tanggal text not null,
  nis text not null,
  nama text not null,
  kelas text not null,
  guru_pembina text not null,
  jenis text not null,
  poin int default 0,
  uraian text not null,
  solusi text not null
);

create table if not exists pengumpulan_tugas (
  id_pengumpulan text primary key,
  waktu_pengiriman text not null,
  nis text not null,
  nama_siswa text not null,
  kelas text not null,
  tanggal_tugas text not null,
  mapel text not null,
  keterangan text not null,
  nama_file text not null,
  status text not null default 'Terkirim',
  nilai_tugas text default '',
  catatan_nilai text default ''
);

-- Aktifkan Realtime Publication di Supabase
alter publication supabase_realtime add table kehadiran_pegawai, jurnal_harian, kehadiran_siswa, pengumpulan_tugas, pembinaan_siswa;
`;
