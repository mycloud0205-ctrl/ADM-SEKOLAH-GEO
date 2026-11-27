import type Database from 'better-sqlite3';
import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let sslAutoDetected = false;

export function isMysqlConfigured(): boolean {
  return Boolean(
    process.env.MYSQL_HOST?.trim() &&
      process.env.MYSQL_USER?.trim() &&
      process.env.MYSQL_DATABASE?.trim()
  );
}

function isSslRequested(): boolean {
  if (sslAutoDetected) return true;
  const sslEnv = String(process.env.MYSQL_SSL || '').trim().toLowerCase();
  return sslEnv === 'true' || sslEnv === '1' || sslEnv === 'require' || sslEnv === 'strict';
}

function buildPoolOptions(forceSsl?: boolean): mysql.PoolOptions {
  const useSsl = forceSsl ?? isSslRequested();
  const strictSsl = String(process.env.MYSQL_SSL || '').trim().toLowerCase() === 'strict';
  return {
    host: process.env.MYSQL_HOST!.trim(),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER!.trim(),
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE!.trim(),
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 3,
    idleTimeout: 60000,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: 'utf8mb4',
    ...(useSsl ? { ssl: { rejectUnauthorized: strictSsl } } : {}),
  };
}

export async function resetMysqlPool(): Promise<void> {
  if (pool) {
    const oldPool = pool;
    pool = null;
    await oldPool.end().catch(() => {});
  }
}

function getMysqlPool(): mysql.Pool | null {
  if (!isMysqlConfigured()) return null;
  if (!pool) {
    pool = mysql.createPool(buildPoolOptions());
  }
  return pool;
}

function formatMysqlErrorDiagnostic(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || '';
  const host = process.env.MYSQL_HOST?.trim() || 'localhost';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER?.trim() || '-';
  const dbName = process.env.MYSQL_DATABASE?.trim() || '-';

  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
    if (host === 'localhost' || host === '127.0.0.1') {
      return `Koneksi ditolak (${host}:${port}). Server MySQL tidak aktif di localhost ini. Catatan: jika memakai shared hosting seperti InfinityFree, host "localhost" hanya bisa diakses dari PHP internal hosting tersebut — untuk aplikasi Node.js gunakan MySQL Remote Host (atau ekspor file .sql ke phpMyAdmin).`;
    }
    return `Koneksi ditolak oleh ${host}:${port}. Pastikan port MySQL terbuka dan layanan MySQL sedang berjalan.`;
  }
  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('ETIMEDOUT')) {
    return `Server MySQL (${host}:${port}) tidak dapat dijangkau / timeout. Periksa nama host, port, serta aktifkan izin Remote MySQL / IP Whitelist di panel hosting.`;
  }
  if (code === 'ER_ACCESS_DENIED_ERROR' || msg.includes('Access denied')) {
    return `Akses ditolak untuk user "${user}". Periksa MYSQL_USER dan MYSQL_PASSWORD, serta pastikan user diizinkan login dari host eksternal ('%') di menu Remote MySQL hosting.`;
  }
  if (code === 'ER_BAD_DB_ERROR' || msg.includes('Unknown database')) {
    return `Database "${dbName}" belum ditemukan di server MySQL. Buat database tersebut terlebih dahulu melalui panel hosting / phpMyAdmin.`;
  }
  if (code === 'ER_SECURE_TRANSPORT_REQUIRED' || msg.toLowerCase().includes('insecure transport')) {
    return `Server MySQL mewajibkan koneksi terenkripsi SSL/TLS. Tambahkan MYSQL_SSL=true pada Secrets / .env.`;
  }
  return `Koneksi MySQL gagal (${code || 'ERROR'}): ${msg}`;
}

async function queryWithAutoSslRetry<T>(fn: (p: mysql.Pool) => Promise<T>): Promise<T> {
  let p = getMysqlPool();
  if (!p) throw new Error('Konfigurasi MYSQL_* belum lengkap.');
  try {
    return await fn(p);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code || '';
    if (
      !isSslRequested() &&
      (code === 'ER_SECURE_TRANSPORT_REQUIRED' || msg.toLowerCase().includes('insecure transport'))
    ) {
      sslAutoDetected = true;
      await resetMysqlPool();
      p = mysql.createPool(buildPoolOptions(true));
      pool = p;
      return await fn(p);
    }
    if (code === 'PROTOCOL_CONNECTION_LOST' || code === 'ECONNRESET') {
      await resetMysqlPool();
      p = getMysqlPool()!;
      return await fn(p);
    }
    throw err;
  }
}

export const PHP_CONNECTION_TEMPLATE = `<?php
// Simpan kredensial database di environment server (.env / hosting panel), jangan hardcode di repo publik.
$host     = getenv('MYSQL_HOST') ?: 'localhost';
$username = getenv('MYSQL_USER') ?: 'icdhdgev_absen';
$password = getenv('MYSQL_PASSWORD') ?: 'absen797904';
$database = getenv('MYSQL_DATABASE') ?: 'icdhdgev_admschool';

$koneksi = mysqli_connect($host, $username, $password, $database);

if (!$koneksi) {
    die("Koneksi gagal: " . mysqli_connect_error());
}
mysqli_set_charset($koneksi, "utf8mb4");
?>`;

export const MYSQL_SCHEMA_SQL = `-- Skema Database MySQL Lengkap: Sistem Integrasi Sekolah (icdhdgev_admschool)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS auth_meta (
  \`key\` VARCHAR(64) PRIMARY KEY,
  value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  nama VARCHAR(180) NOT NULL,
  nis_nip VARCHAR(64) NOT NULL,
  kelas VARCHAR(64) NOT NULL DEFAULT 'ALL',
  jk VARCHAR(16) NOT NULL DEFAULT 'L'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengaturan (
  id INT PRIMARY KEY,
  nama_sekolah VARCHAR(180) NOT NULL,
  alamat_sekolah TEXT NOT NULL,
  tahun_ajaran VARCHAR(32) NOT NULL,
  nama_walikelas VARCHAR(150) NOT NULL,
  kelas_ampu VARCHAR(64) NOT NULL,
  lat_gps DOUBLE NOT NULL,
  lng_gps DOUBLE NOT NULL,
  radius_meter INT NOT NULL,
  footer_app VARCHAR(255) NOT NULL,
  logo_sekolah LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hak_akses_role (
  id VARCHAR(64) PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  admin TINYINT(1) NOT NULL DEFAULT 1,
  guru TINYINT(1) NOT NULL DEFAULT 1,
  karyawan TINYINT(1) NOT NULL DEFAULT 0,
  siswa TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS siswa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nis VARCHAR(64) NOT NULL UNIQUE,
  nama VARCHAR(180) NOT NULL,
  kelas VARCHAR(64) NOT NULL,
  jurusan VARCHAR(120) NOT NULL,
  jk VARCHAR(16) NOT NULL DEFAULT 'L',
  tempat_pkl VARCHAR(180) NOT NULL DEFAULT '-',
  nilai_sm1 VARCHAR(32) NOT NULL DEFAULT '-',
  nilai_sm2 VARCHAR(32) NOT NULL DEFAULT '-',
  status_sm1 VARCHAR(64) NOT NULL DEFAULT '-',
  status_sm2 VARCHAR(64) NOT NULL DEFAULT '-',
  tugas_belum_sm1 TEXT NOT NULL,
  tugas_belum_sm2 TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kehadiran_siswa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tgl_absen VARCHAR(20) NOT NULL,
  waktu_input VARCHAR(20) NOT NULL,
  nis VARCHAR(64) NOT NULL,
  nama VARCHAR(180) NOT NULL,
  kelas VARCHAR(64) NOT NULL,
  jurusan VARCHAR(120) NOT NULL DEFAULT '-',
  jk VARCHAR(16) NOT NULL DEFAULT '-',
  status VARCHAR(32) NOT NULL DEFAULT 'Hadir',
  jarak_meter VARCHAR(64) NOT NULL DEFAULT '-',
  UNIQUE KEY uq_siswa_tgl (tgl_absen, nis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kehadiran_pegawai (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tgl_absen VARCHAR(20) NOT NULL,
  waktu_input VARCHAR(20) NOT NULL,
  nip_user VARCHAR(64) NOT NULL,
  nama VARCHAR(180) NOT NULL,
  role_jabatan VARCHAR(64) NOT NULL,
  jk VARCHAR(16) NOT NULL DEFAULT 'L',
  status VARCHAR(32) NOT NULL DEFAULT 'Hadir',
  jarak_meter VARCHAR(64) NOT NULL DEFAULT '-',
  UNIQUE KEY uq_pegawai_tgl (tgl_absen, nip_user)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kalender_pendidikan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal VARCHAR(20) NOT NULL UNIQUE,
  mode_kbm VARCHAR(32) NOT NULL,
  status_efektif VARCHAR(32) NOT NULL,
  jam_mulai VARCHAR(16) NOT NULL,
  jam_selesai VARCHAR(16) NOT NULL,
  keterangan TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengumpulan_tugas (
  id_pengumpulan VARCHAR(64) PRIMARY KEY,
  waktu_pengiriman VARCHAR(40) NOT NULL,
  nis VARCHAR(64) NOT NULL,
  nama_siswa VARCHAR(180) NOT NULL,
  kelas VARCHAR(64) NOT NULL,
  tanggal_tugas VARCHAR(20) NOT NULL,
  mapel VARCHAR(120) NOT NULL,
  keterangan TEXT NOT NULL,
  nama_file VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Terkirim',
  nilai_tugas VARCHAR(32) NOT NULL DEFAULT '',
  catatan_nilai TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jurnal_harian (
  id INT AUTO_INCREMENT PRIMARY KEY,
  waktu_input VARCHAR(40) NOT NULL,
  tanggal VARCHAR(20) NOT NULL,
  guru_nama VARCHAR(180) NOT NULL,
  jam_ke VARCHAR(64) NOT NULL,
  kelas VARCHAR(64) NOT NULL,
  mapel VARCHAR(120) NOT NULL,
  tujuan TEXT NOT NULL,
  materi TEXT NOT NULL,
  metode TEXT NOT NULL,
  refleksi TEXT NOT NULL,
  tugas TEXT NOT NULL,
  nilai_progres VARCHAR(64) NOT NULL DEFAULT '-',
  foto_url TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pembinaan_siswa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  waktu_input VARCHAR(40) NOT NULL,
  tanggal VARCHAR(20) NOT NULL,
  nis VARCHAR(64) NOT NULL,
  nama VARCHAR(180) NOT NULL,
  kelas VARCHAR(64) NOT NULL,
  guru_pembina VARCHAR(180) NOT NULL,
  jenis VARCHAR(120) NOT NULL,
  poin INT NOT NULL DEFAULT 0,
  uraian TEXT NOT NULL,
  solusi TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jadwal_pelajaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hari VARCHAR(32) NOT NULL,
  jam VARCHAR(120) NOT NULL,
  kelas VARCHAR(64) NOT NULL,
  mapel VARCHAR(120) NOT NULL,
  guru VARCHAR(180) NOT NULL,
  ruang VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agenda_akademik (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal VARCHAR(20) NOT NULL,
  judul VARCHAR(180) NOT NULL,
  kategori VARCHAR(64) NOT NULL,
  keterangan TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS data_jurusan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(32) NOT NULL UNIQUE,
  nama VARCHAR(180) NOT NULL,
  kurikulum VARCHAR(120) NOT NULL,
  fasilitas TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS master_mapel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

export async function ensureMysqlSchema(): Promise<void> {
  if (!isMysqlConfigured()) return;
  const statements = MYSQL_SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  await queryWithAutoSslRetry(async (p) => {
    for (const stmt of statements) {
      await p.query(stmt);
    }
  });
}

function detectMysqlHostType(host: string): 'infinityfree' | 'localhost' | 'remote' | 'unconfigured' {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return 'unconfigured';
  if (normalized.includes('infinityfree') || normalized.includes('epizy') || normalized.includes('byet')) {
    return 'infinityfree';
  }
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
    return 'localhost';
  }
  return 'remote';
}

export async function testMysqlConnection(): Promise<{
  ok: boolean;
  configured: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  hostType: 'infinityfree' | 'localhost' | 'remote' | 'unconfigured';
  sslActive: boolean;
  serverVersion: string;
  tableCount: number;
  latencyMs: number;
  errorCode: string;
  message: string;
}> {
  const host = process.env.MYSQL_HOST?.trim() || '';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const database = process.env.MYSQL_DATABASE?.trim() || '';
  const user = process.env.MYSQL_USER?.trim() || '-';
  const hostType = detectMysqlHostType(host);

  if (!isMysqlConfigured()) {
    return {
      ok: false,
      configured: false,
      host,
      port,
      database,
      user,
      hostType,
      sslActive: false,
      serverVersion: '-',
      tableCount: 0,
      latencyMs: 0,
      errorCode: 'UNCONFIGURED',
      message:
        'Konfigurasi MYSQL_HOST, MYSQL_USER, dan MYSQL_DATABASE belum diisi pada Secrets atau file .env server.',
    };
  }

  const startedAt = Date.now();
  try {
    await resetMysqlPool();
    const result = await queryWithAutoSslRetry(async (p) => {
      const [verRows] = await p.query('SELECT VERSION() AS version');
      const [tblRows] = await p.query('SHOW TABLES');
      const verArr = Array.isArray(verRows) ? (verRows as Array<{ version?: string }>) : [];
      const tblArr = Array.isArray(tblRows) ? tblRows : [];
      return {
        serverVersion: String(verArr[0]?.version || 'MySQL'),
        tableCount: tblArr.length,
      };
    });
    const latencyMs = Date.now() - startedAt;
    return {
      ok: true,
      configured: true,
      host,
      port,
      database,
      user,
      hostType,
      sslActive: isSslRequested(),
      serverVersion: result.serverVersion,
      tableCount: result.tableCount,
      latencyMs,
      errorCode: 'OK',
      message: `Koneksi MySQL berhasil terhubung ke ${host}:${port}/${database} (${result.serverVersion}, ${latencyMs} ms, ${result.tableCount} tabel ditemukan).`,
    };
  } catch (err) {
    const errorCode = (err as { code?: string })?.code || 'UNKNOWN';
    return {
      ok: false,
      configured: true,
      host,
      port,
      database,
      user,
      hostType,
      sslActive: isSslRequested(),
      serverVersion: '-',
      tableCount: 0,
      latencyMs: Date.now() - startedAt,
      errorCode,
      message: formatMysqlErrorDiagnostic(err),
    };
  }
}

export type MysqlTableName =
  | 'auth_meta'
  | 'users'
  | 'pengaturan'
  | 'hak_akses_role'
  | 'siswa'
  | 'kehadiran_siswa'
  | 'kehadiran_pegawai'
  | 'kalender_pendidikan'
  | 'pengumpulan_tugas'
  | 'jurnal_harian'
  | 'pembinaan_siswa'
  | 'jadwal_pelajaran'
  | 'agenda_akademik'
  | 'data_jurusan'
  | 'master_mapel';

const ALLOWED_COLUMNS: Record<MysqlTableName, string[]> = {
  auth_meta: ['key', 'value'],
  users: ['id', 'username', 'password_hash', 'role', 'nama', 'nis_nip', 'kelas', 'jk'],
  pengaturan: [
    'id',
    'nama_sekolah',
    'alamat_sekolah',
    'tahun_ajaran',
    'nama_walikelas',
    'kelas_ampu',
    'lat_gps',
    'lng_gps',
    'radius_meter',
    'footer_app',
    'logo_sekolah',
  ],
  hak_akses_role: ['id', 'nama', 'admin', 'guru', 'karyawan', 'siswa'],
  siswa: [
    'nis',
    'nama',
    'kelas',
    'jurusan',
    'jk',
    'tempat_pkl',
    'nilai_sm1',
    'nilai_sm2',
    'status_sm1',
    'status_sm2',
    'tugas_belum_sm1',
    'tugas_belum_sm2',
  ],
  kehadiran_siswa: [
    'tgl_absen',
    'waktu_input',
    'nis',
    'nama',
    'kelas',
    'jurusan',
    'jk',
    'status',
    'jarak_meter',
  ],
  kehadiran_pegawai: [
    'tgl_absen',
    'waktu_input',
    'nip_user',
    'nama',
    'role_jabatan',
    'jk',
    'status',
    'jarak_meter',
  ],
  kalender_pendidikan: ['tanggal', 'mode_kbm', 'status_efektif', 'jam_mulai', 'jam_selesai', 'keterangan'],
  pengumpulan_tugas: [
    'id_pengumpulan',
    'waktu_pengiriman',
    'nis',
    'nama_siswa',
    'kelas',
    'tanggal_tugas',
    'mapel',
    'keterangan',
    'nama_file',
    'file_path',
    'status',
    'nilai_tugas',
    'catatan_nilai',
  ],
  jurnal_harian: [
    'id',
    'waktu_input',
    'tanggal',
    'guru_nama',
    'jam_ke',
    'kelas',
    'mapel',
    'tujuan',
    'materi',
    'metode',
    'refleksi',
    'tugas',
    'nilai_progres',
    'foto_url',
  ],
  pembinaan_siswa: [
    'id',
    'waktu_input',
    'tanggal',
    'nis',
    'nama',
    'kelas',
    'guru_pembina',
    'jenis',
    'poin',
    'uraian',
    'solusi',
  ],
  jadwal_pelajaran: ['id', 'hari', 'jam', 'kelas', 'mapel', 'guru', 'ruang'],
  agenda_akademik: ['id', 'tanggal', 'judul', 'kategori', 'keterangan'],
  data_jurusan: ['kode', 'nama', 'kurikulum', 'fasilitas'],
  master_mapel: ['nama'],
};

function toParamValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

export async function syncRecordToMysql(
  table: MysqlTableName,
  record: Record<string, unknown>
): Promise<void> {
  if (!isMysqlConfigured()) return;
  try {
    const allowed = ALLOWED_COLUMNS[table];
    const cols = allowed.filter((c) => Object.prototype.hasOwnProperty.call(record, c));
    if (cols.length === 0) return;

    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
    const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
    const values = cols.map((c) => toParamValue(record[c]));
    await queryWithAutoSslRetry((p) => p.execute(sql, values));
  } catch (err) {
    console.warn(`[mysql] Gagal sinkronisasi tabel ${table}:`, err instanceof Error ? err.message : err);
  }
}

export async function deleteRecordFromMysql(
  table: MysqlTableName,
  keyColumn: string,
  keyValue: string | number
): Promise<void> {
  if (!isMysqlConfigured()) return;
  try {
    const allowedCols = ALLOWED_COLUMNS[table];
    if (keyColumn !== 'id' && !allowedCols.includes(keyColumn)) return;
    await queryWithAutoSslRetry((p) =>
      p.execute(`DELETE FROM \`${table}\` WHERE \`${keyColumn}\` = ?`, [keyValue])
    );
  } catch (err) {
    console.warn(`[mysql] Gagal hapus baris di tabel ${table}:`, err instanceof Error ? err.message : err);
  }
}

export async function syncAllFromSqliteToMysql(
  sqliteDb: Database.Database
): Promise<{ ok: boolean; message: string; syncedCounts: Record<string, number> }> {
  if (!isMysqlConfigured()) {
    return {
      ok: false,
      message:
        'Konfigurasi MYSQL_HOST, MYSQL_USER, dan MYSQL_DATABASE belum diatur pada server Secrets atau file .env.',
      syncedCounts: {},
    };
  }

  try {
    await queryWithAutoSslRetry((p) => p.query('SELECT 1'));
    await ensureMysqlSchema();

    const tables: MysqlTableName[] = [
      'auth_meta',
      'users',
      'pengaturan',
      'hak_akses_role',
      'data_jurusan',
      'master_mapel',
      'kalender_pendidikan',
      'agenda_akademik',
      'siswa',
      'jadwal_pelajaran',
      'kehadiran_siswa',
      'kehadiran_pegawai',
      'jurnal_harian',
      'pembinaan_siswa',
      'pengumpulan_tugas',
    ];

    const syncedCounts: Record<string, number> = {};
    const chunkSize = 100;

    await queryWithAutoSslRetry(async (p) => {
      for (const table of tables) {
        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          syncedCounts[table] = 0;
          continue;
        }
        const cols = ALLOWED_COLUMNS[table];
        const colList = cols.map((c) => `\`${c}\``).join(', ');
        const updates = cols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
        const rowPlaceholder = `(${cols.map(() => '?').join(', ')})`;

        let count = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const allPlaceholders = chunk.map(() => rowPlaceholder).join(', ');
          const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${allPlaceholders} ON DUPLICATE KEY UPDATE ${updates}`;
          const flatValues: Array<string | number | boolean | null> = [];
          for (const row of chunk) {
            for (const c of cols) {
              flatValues.push(toParamValue(row[c]));
            }
          }
          await p.query(sql, flatValues);
          count += chunk.length;
        }
        syncedCounts[table] = count;
      }
    });

    return {
      ok: true,
      message: `Sinkronisasi seluruh database ke MySQL berhasil (${syncedCounts.siswa ?? 0} data siswa, ${syncedCounts.jadwal_pelajaran ?? 0} jadwal, ${syncedCounts.jurnal_harian ?? 0} jurnal, & seluruh tabel lainnya tersinkronkan).`,
      syncedCounts,
    };
  } catch (err) {
    return {
      ok: false,
      message: formatMysqlErrorDiagnostic(err),
      syncedCounts: {},
    };
  }
}

function escapeMysqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return "''";
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  const s = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `'${s}'`;
}

export function generateMysqlDumpSql(sqliteDb: Database.Database): string {
  const lines: string[] = [
    '-- ============================================================',
    '-- EXPORT DATABASE MYSQL LENGKAP: icdhdgev_admschool',
    '-- Siap diimpor melalui phpMyAdmin / MySQL Client',
    '-- ============================================================',
    '',
    MYSQL_SCHEMA_SQL,
    '',
  ];

  const tables: MysqlTableName[] = [
    'auth_meta',
    'users',
    'pengaturan',
    'hak_akses_role',
    'data_jurusan',
    'master_mapel',
    'kalender_pendidikan',
    'agenda_akademik',
    'siswa',
    'jadwal_pelajaran',
    'kehadiran_siswa',
    'kehadiran_pegawai',
    'jurnal_harian',
    'pembinaan_siswa',
    'pengumpulan_tugas',
  ];

  for (const table of tables) {
    const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;
    const cols = ALLOWED_COLUMNS[table];
    const colHeader = cols.map((c) => `\`${c}\``).join(', ');
    const updates = cols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');

    lines.push(`-- Data tabel: ${table} (${rows.length} baris)`);
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const valuesBlock = chunk
        .map((row) => `(${cols.map((c) => escapeMysqlLiteral(row[c])).join(', ')})`)
        .join(',\n  ');
      lines.push(
        `INSERT INTO \`${table}\` (${colHeader}) VALUES\n  ${valuesBlock}\nON DUPLICATE KEY UPDATE ${updates};`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
