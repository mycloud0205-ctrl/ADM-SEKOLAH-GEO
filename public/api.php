<?php
/**
 * Backend API Bridge PHP (PDO MySQL) untuk Hosting Apache / LiteSpeed / cPanel PHP
 * Digunakan otomatis saat folder dist/ di-upload ke hosting PHP tanpa Node.js.
 * Kredensial database dibaca dari environment server atau file .env (tidak di-hardcode).
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Access-Token');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

date_default_timezone_set('Asia/Jakarta');

function json_response($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function load_env_files() {
    $candidates = [
        dirname(__DIR__, 2) . '/.env', // dua tingkat di atas folder api.php
        dirname(__DIR__, 1) . '/.env', // di luar public_html / demo (paling aman)
        __DIR__ . '/.env',             // satu folder dengan api.php (dilindungi .htaccess)
    ];
    foreach ($candidates as $file) {
        if (!is_file($file) || !is_readable($file)) continue;
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) continue;
        foreach ($lines as $line) {
            $trim = trim($line);
            if ($trim === '' || $trim[0] === '#') continue;
            $pos = strpos($trim, '=');
            if ($pos === false) continue;
            $key = trim(substr($trim, 0, $pos));
            $val = trim(substr($trim, $pos + 1));
            if (
                strlen($val) >= 2 &&
                (($val[0] === '"' && $val[strlen($val) - 1] === '"') ||
                 ($val[0] === "'" && $val[strlen($val) - 1] === "'"))
            ) {
                $val = substr($val, 1, -1);
            }
            if ($key !== '' && getenv($key) === false) {
                putenv($key . '=' . $val);
                $_ENV[$key] = $val;
            }
        }
    }
}

load_env_files();

function env_val($key, $default = '') {
    $v = getenv($key);
    if ($v !== false && $v !== '') return $v;
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') return (string)$_ENV[$key];
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return (string)$_SERVER[$key];
    return $default;
}

function get_pdo() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $host = trim(env_val('MYSQL_HOST', 'localhost'));
    $port = trim(env_val('MYSQL_PORT', '3306'));
    $user = trim(env_val('MYSQL_USER', ''));
    $pass = env_val('MYSQL_PASSWORD', '');
    $db   = trim(env_val('MYSQL_DATABASE', ''));

    if ($host === '' || $user === '' || $db === '') {
        json_response([
            'status' => false,
            'message' => 'Konfigurasi MYSQL_HOST, MYSQL_USER, dan MYSQL_DATABASE belum diatur pada file .env atau environment hosting PHP.',
        ], 500);
    }

    try {
        $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        ensure_mysql_schema_and_seed($pdo);
        return $pdo;
    } catch (Throwable $e) {
        json_response([
            'status' => false,
            'message' => 'Koneksi MySQL PHP gagal (' . $host . ':' . $port . '/' . $db . '): ' . $e->getMessage(),
        ], 500);
    }
}

function get_mysql_schema_sql() {
    return <<<'SQL'
CREATE TABLE IF NOT EXISTS auth_meta (
  `key` VARCHAR(64) PRIMARY KEY,
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
SQL;
}

function hash_password_php($password) {
    $salt = bin2hex(random_bytes(16));
    $iter = 100000;
    $derived = hash_pbkdf2('sha256', $password, $salt, $iter, 32, false);
    return "pbkdf2_sha256:{$iter}:{$salt}:{$derived}";
}

function verify_password_php($password, $storedHash) {
    if (!$storedHash) return false;
    if (strpos($storedHash, 'pbkdf2_sha256:') === 0) {
        $parts = explode(':', $storedHash);
        if (count($parts) !== 4) return false;
        $iter = (int)$parts[1];
        $salt = $parts[2];
        $expected = $parts[3];
        if ($iter <= 0 || $salt === '' || $expected === '') return false;
        $derived = hash_pbkdf2('sha256', $password, $salt, $iter, 32, false);
        return hash_equals($expected, $derived);
    }
    if (strpos($storedHash, '$2') === 0 || strpos($storedHash, '$argon2') === 0) {
        return password_verify($password, $storedHash);
    }
    return false;
}

function import_csv_students(PDO $pdo, $csvText) {
    $lines = preg_split('/\r\n|\n|\r/', trim((string)$csvText));
    if (!is_array($lines) || count($lines) === 0) {
        return ['importedCount' => 0, 'skippedCount' => 0];
    }
    $firstLine = $lines[0];
    $delimiter = (substr_count($firstLine, ';') >= substr_count($firstLine, ',')) ? ';' : ',';
    $rows = [];
    foreach ($lines as $line) {
        if (trim($line) === '') continue;
        $rows[] = str_getcsv($line, $delimiter);
    }
    if (count($rows) <= 1) {
        return ['importedCount' => 0, 'skippedCount' => 0];
    }

    $header = array_map(function($h) {
        return strtolower(trim(preg_replace('/\s+/', ' ', (string)$h)));
    }, $rows[0]);

    $findCol = function($candidates) use ($header) {
        foreach ($candidates as $cand) {
            foreach ($header as $idx => $h) {
                if (strpos($h, $cand) !== false) return $idx;
            }
        }
        return -1;
    };

    $idxNis     = $findCol(['nisn', 'nis']);
    $idxNama    = $findCol(['nama peserta didik', 'nama siswa', 'nama']);
    $idxKelas   = $findCol(['kelas', 'rombel']);
    $idxJurusan = $findCol(['jurusan', 'kompetensi', 'konsentrasi']);
    $idxJk      = $findCol(['l/p', 'jk', 'kelamin']);
    $idxPkl     = $findCol(['tempat pkl', 'pkl', 'dudi']);
    $idxN1      = $findCol(['nilai sm1', 'sm1']);
    $idxN2      = $findCol(['nilai sm2', 'sm2']);
    $idxS1      = $findCol(['status sm1']);
    $idxS2      = $findCol(['status sm2']);
    $idxT1      = $findCol(['tugas belum sm1']);
    $idxT2      = $findCol(['tugas belum sm2']);

    $imported = 0;
    $skipped = 0;
    $stmt = $pdo->prepare(
        'INSERT INTO siswa (nis, nama, kelas, jurusan, jk, tempat_pkl, nilai_sm1, nilai_sm2, status_sm1, status_sm2, tugas_belum_sm1, tugas_belum_sm2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           nama = VALUES(nama), kelas = VALUES(kelas), jurusan = VALUES(jurusan), jk = VALUES(jk),
           tempat_pkl = VALUES(tempat_pkl), nilai_sm1 = VALUES(nilai_sm1), nilai_sm2 = VALUES(nilai_sm2),
           status_sm1 = VALUES(status_sm1), status_sm2 = VALUES(status_sm2),
           tugas_belum_sm1 = VALUES(tugas_belum_sm1), tugas_belum_sm2 = VALUES(tugas_belum_sm2)'
    );

    $pdo->beginTransaction();
    try {
        for ($i = 1; $i < count($rows); $i++) {
            $cols = $rows[$i];
            $nis  = trim((string)($cols[$idxNis >= 0 ? $idxNis : 0] ?? ''));
            $nama = trim((string)($cols[$idxNama >= 0 ? $idxNama : 1] ?? ''));
            if ($nis === '' || $nama === '' || strtolower($nis) === 'nis') {
                $skipped++;
                continue;
            }
            $kelas = trim((string)($cols[$idxKelas >= 0 ? $idxKelas : 2] ?? 'X')) ?: 'X';
            $jurusan = trim((string)($cols[$idxJurusan >= 0 ? $idxJurusan : 3] ?? 'Umum')) ?: 'Umum';
            $rawJk = strtoupper(trim((string)($cols[$idxJk >= 0 ? $idxJk : 4] ?? 'L')));
            $jk = ($rawJk !== '' && $rawJk[0] === 'P') ? 'P' : 'L';
            $pkl = $idxPkl >= 0 ? (trim((string)($cols[$idxPkl] ?? '-')) ?: '-') : '-';
            $n1  = $idxN1 >= 0 ? (trim((string)($cols[$idxN1] ?? '-')) ?: '-') : '-';
            $n2  = $idxN2 >= 0 ? (trim((string)($cols[$idxN2] ?? '-')) ?: '-') : '-';
            $s1  = $idxS1 >= 0 ? (trim((string)($cols[$idxS1] ?? '-')) ?: '-') : '-';
            $s2  = $idxS2 >= 0 ? (trim((string)($cols[$idxS2] ?? '-')) ?: '-') : '-';
            $t1  = $idxT1 >= 0 ? (trim((string)($cols[$idxT1] ?? '-')) ?: '-') : '-';
            $t2  = $idxT2 >= 0 ? (trim((string)($cols[$idxT2] ?? '-')) ?: '-') : '-';
            $stmt->execute([$nis, $nama, $kelas, $jurusan, $jk, $pkl, $n1, $n2, $s1, $s2, $t1, $t2]);
            $imported++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['importedCount' => $imported, 'skippedCount' => $skipped];
}

function ensure_mysql_schema_and_seed(PDO $pdo) {
    static $done = false;
    if ($done) return;
    $done = true;

    $hasPengaturan = $pdo->query("SHOW TABLES LIKE 'pengaturan'")->fetch();
    if (!$hasPengaturan) {
        $stmts = array_filter(array_map('trim', explode(';', get_mysql_schema_sql())));
        foreach ($stmts as $sql) {
            if ($sql !== '') $pdo->exec($sql);
        }
    }

    $cfgCount = (int)$pdo->query('SELECT COUNT(*) FROM pengaturan')->fetchColumn();
    if ($cfgCount === 0) {
        $pdo->prepare(
            'INSERT INTO pengaturan (id, nama_sekolah, alamat_sekolah, tahun_ajaran, nama_walikelas, kelas_ampu, lat_gps, lng_gps, radius_meter, footer_app, logo_sekolah)
             VALUES (1, ?, ?, ?, ?, ?, -7.001759, 107.623047, 100, ?, ?)'
        )->execute([
            'SMK KP BALEENDAH',
            'Jl. Adipati Agung No. 23, Baleendah, Kab. Bandung',
            '2025/2026',
            'Admin Kurikulum',
            'XII TKJ 1',
            'Sistem Integrasi Sekolah - Real-Time Database Engine',
            '',
        ]);
    }

    $hakCount = (int)$pdo->query('SELECT COUNT(*) FROM hak_akses_role')->fetchColumn();
    if ($hakCount === 0) {
        $defaults = [
            ['dashboard', 'Dashboard Utama & Analisis', 1, 1, 1, 1],
            ['dash-kehadiran-guru', 'Live Status Mengajar Guru & Rombel', 1, 1, 1, 0],
            ['scan', 'Presensi GPS Harian', 1, 1, 1, 1],
            ['jurnal', 'Jurnal Harian & KBM', 1, 1, 0, 0],
            ['input', 'Input Absensi Kelas (Batch)', 1, 1, 0, 0],
            ['rekap-siswa', 'Rekap Absensi Siswa', 1, 1, 0, 0],
            ['rekap-pegawai', 'Data Kehadiran Guru & Karyawan', 1, 1, 1, 0],
            ['kalender-pendidikan', 'Kalender Pendidikan & Mode KBM', 1, 1, 1, 1],
            ['tugas-digital', 'Tugas Digital Siswa', 1, 0, 0, 1],
            ['pembinaan', 'Pembinaan & Kedisiplinan', 1, 1, 0, 1],
            ['guru-jadwal', 'Kelola Jadwal Mengajar', 1, 1, 0, 0],
            ['master-jadwal', 'Master Jadwal Kelas', 1, 1, 0, 1],
        ];
        $stmt = $pdo->prepare('INSERT INTO hak_akses_role (id, nama, admin, guru, karyawan, siswa) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($defaults as $row) $stmt->execute($row);
    }

    $jurCount = (int)$pdo->query('SELECT COUNT(*) FROM data_jurusan')->fetchColumn();
    if ($jurCount === 0) {
        $jurs = [
            ['TKJ', 'Teknik Komputer dan Jaringan', 'Kurikulum Merdeka', 'Lab Jaringan Fiber & Mikrotik'],
            ['RPL', 'Rekayasa Perangkat Lunak', 'Kurikulum Merdeka', 'Lab Pemrograman Web & Mobile'],
            ['TSM', 'Teknik Sepeda Motor', 'Kurikulum Merdeka', 'Bengkel Praktik Otomotif'],
            ['TKR', 'Teknik Kendaraan Ringan', 'Kurikulum Merdeka', 'Workshop Otomotif Standar Industri'],
            ['AKL', 'Akuntansi dan Keuangan Lembaga', 'Kurikulum Merdeka', 'Lab Akuntansi Digital'],
        ];
        $stmt = $pdo->prepare('INSERT INTO data_jurusan (kode, nama, kurikulum, fasilitas) VALUES (?, ?, ?, ?)');
        foreach ($jurs as $j) $stmt->execute($j);
    }

    $mapelCount = (int)$pdo->query('SELECT COUNT(*) FROM master_mapel')->fetchColumn();
    if ($mapelCount === 0) {
        $mapels = [
            'Pendidikan Agama Islam & Budi Pekerti', 'Pendidikan Pancasila', 'Bahasa Indonesia',
            'Matematika', 'Sejarah Indonesia', 'Bahasa Inggris', 'Pendidikan Jasmani, Olahraga & Kesehatan',
            'Informatika', 'Projek IPAS', 'Bahasa Sunda', 'Dasar-Dasar Teknik Jaringan Komputer',
            'Administrasi Infrastruktur Jaringan', 'Pemrograman Web & Perangkat Bergerak',
            'Basis Data', 'Produk Kreatif & Kewirausahaan', 'Bimbingan Konseling (BK)',
        ];
        $stmt = $pdo->prepare('INSERT INTO master_mapel (nama) VALUES (?)');
        foreach ($mapels as $m) $stmt->execute([$m]);
    }

    $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($userCount === 0) {
        $staff = [
            ['admin', '', 'admin', 'Administrator Sekolah', 'ADMIN01', 'ALL', 'L'],
            ['guru', hash_password_php('guru123'), 'guru', 'Guru Pengajar Utama', 'GURU01', 'ALL', 'L'],
            ['guru2', hash_password_php('guru123'), 'guru', 'Ibu Rina Kartika, S.Pd', 'GURU02', 'ALL', 'P'],
            ['karyawan', hash_password_php('karyawan123'), 'karyawan', 'Staf Administrasi TU', 'KARY01', 'ALL', 'P'],
        ];
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, role, nama, nis_nip, kelas, jk) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($staff as $u) $stmt->execute($u);
    } else {
        $healStmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE username = ? AND (password_hash IS NULL OR TRIM(password_hash) = '')");
        $healStmt->execute([hash_password_php('guru123'), 'guru']);
        $healStmt->execute([hash_password_php('guru123'), 'guru2']);
        $healStmt->execute([hash_password_php('karyawan123'), 'karyawan']);
    }

    $siswaCount = (int)$pdo->query('SELECT COUNT(*) FROM siswa')->fetchColumn();
    if ($siswaCount === 0) {
        $csvCandidates = [
            __DIR__ . '/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv',
            dirname(__DIR__, 1) . '/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv',
        ];
        foreach ($csvCandidates as $csvPath) {
            if (is_file($csvPath)) {
                $csvText = @file_get_contents($csvPath);
                if ($csvText) {
                    import_csv_students($pdo, $csvText);
                    break;
                }
            }
        }
    }
}

function get_session_secret(PDO $pdo) {
    $envSecret = trim(env_val('SESSION_SECRET', ''));
    if (strlen($envSecret) >= 16) return $envSecret;
    $stmt = $pdo->prepare("SELECT value FROM auth_meta WHERE `key` = 'session_secret'");
    $stmt->execute();
    $row = $stmt->fetch();
    if ($row && !empty($row['value'])) return (string)$row['value'];
    $gen = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT IGNORE INTO auth_meta (`key`, value) VALUES ('session_secret', ?)")->execute([$gen]);
    return $gen;
}

function b64url_encode($str) {
    return rtrim(strtr(base64_encode($str), '+/', '-_'), '=');
}

function b64url_decode($str) {
    $pad = strlen($str) % 4;
    if ($pad) $str .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($str, '-_', '+/'));
}

function sign_token(PDO $pdo, array $payload) {
    $secret = get_session_secret($pdo);
    $data = b64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $sig = b64url_encode(hash_hmac('sha256', $data, $secret, true));
    return $data . '.' . $sig;
}

function verify_token(PDO $pdo, $token) {
    $parts = explode('.', (string)$token);
    if (count($parts) !== 2) return null;
    [$data, $sig] = $parts;
    $secret = get_session_secret($pdo);
    $expected = b64url_encode(hash_hmac('sha256', $data, $secret, true));
    if (!hash_equals($expected, $sig)) return null;
    $decoded = json_decode((string)b64url_decode($data), true);
    if (!is_array($decoded) || empty($decoded['exp']) || ((int)$decoded['exp'] < (int)(microtime(true) * 1000))) {
        return null;
    }
    return $decoded;
}

function get_bearer_token() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('apache_request_headers')) {
        $hdrs = apache_request_headers();
        foreach ($hdrs as $k => $v) {
            if (strtolower($k) === 'authorization' || strtolower($k) === 'x-access-token') {
                $header = $v;
                break;
            }
        }
    }
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    if (!empty($_SERVER['HTTP_X_ACCESS_TOKEN'])) {
        return trim((string)$_SERVER['HTTP_X_ACCESS_TOKEN']);
    }
    return '';
}

function require_auth(PDO $pdo, array $roles = []) {
    $token = get_bearer_token();
    if ($token === '') {
        json_response(['status' => false, 'message' => 'Sesi login diperlukan.'], 401);
    }
    $user = verify_token($pdo, $token);
    if (!$user) {
        json_response(['status' => false, 'message' => 'Sesi login berakhir. Silakan masuk ulang.'], 401);
    }
    if (!empty($roles) && !in_array(strtolower((string)($user['role'] ?? '')), $roles, true)) {
        json_response(['status' => false, 'message' => 'Akses ditolak untuk peran Anda.'], 403);
    }
    return $user;
}

function get_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function get_nama_hari_wib($dateStr) {
    $map = [0 => 'Minggu', 1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu', 4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu'];
    $ts = strtotime($dateStr);
    if ($ts === false) return 'Senin';
    return $map[(int)date('w', $ts)] ?? 'Senin';
}

function time_to_minutes($hhmm) {
    $p = explode(':', trim((string)$hhmm));
    return ((int)($p[0] ?? 0) * 60) + (int)($p[1] ?? 0);
}

function hitung_jarak_meter($lat1, $lon1, $lat2, $lon2) {
    $R = 6371e3;
    $phi1 = deg2rad($lat1);
    $phi2 = deg2rad($lat2);
    $dPhi = deg2rad($lat2 - $lat1);
    $dLam = deg2rad($lon2 - $lon1);
    $a = sin($dPhi / 2) ** 2 + cos($phi1) * cos($phi2) * sin($dLam / 2) ** 2;
    return $R * (2 * atan2(sqrt($a), sqrt(1 - $a)));
}

function get_sesi_waktu_sekolah() {
    return [
        ['jamKe' => 1, 'label' => 'Jam 1', 'mulai' => '07:00', 'selesai' => '07:45'],
        ['jamKe' => 2, 'label' => 'Jam 2', 'mulai' => '07:45', 'selesai' => '08:30'],
        ['jamKe' => 3, 'label' => 'Jam 3', 'mulai' => '08:30', 'selesai' => '09:15'],
        ['jamKe' => 4, 'label' => 'Jam 4', 'mulai' => '09:30', 'selesai' => '10:15'],
        ['jamKe' => 5, 'label' => 'Jam 5', 'mulai' => '10:15', 'selesai' => '11:00'],
        ['jamKe' => 6, 'label' => 'Jam 6', 'mulai' => '11:00', 'selesai' => '11:45'],
        ['jamKe' => 7, 'label' => 'Jam 7', 'mulai' => '12:15', 'selesai' => '13:00'],
        ['jamKe' => 8, 'label' => 'Jam 8', 'mulai' => '13:00', 'selesai' => '13:45'],
        ['jamKe' => 9, 'label' => 'Jam 9', 'mulai' => '13:45', 'selesai' => '14:30'],
        ['jamKe' => 10, 'label' => 'Jam 10', 'mulai' => '14:30', 'selesai' => '15:15'],
    ];
}

function parse_jam_ke_range($jamStr) {
    if (preg_match('/Jam\s*(\d+)\s*(?:-|s\.?d\.?|–)?\s*(\d+)?/i', (string)$jamStr, $m)) {
        $start = (int)$m[1];
        $end = !empty($m[2]) ? (int)$m[2] : $start;
        return ['start' => min($start, $end), 'end' => max($start, $end)];
    }
    return ['start' => null, 'end' => null];
}

function is_admin_claimed(PDO $pdo) {
    $stmt = $pdo->prepare("SELECT value FROM auth_meta WHERE `key` = 'admin_claimed'");
    $stmt->execute();
    $r = $stmt->fetch();
    if ($r && $r['value'] === 'true') return true;
    $adm = $pdo->query("SELECT password_hash FROM users WHERE username = 'admin'")->fetch();
    return $adm && trim((string)$adm['password_hash']) !== '';
}

function get_pengaturan(PDO $pdo) {
    $row = $pdo->query('SELECT * FROM pengaturan WHERE id = 1')->fetch();
    if (!$row) {
        return [
            'namaSekolah' => 'SMK KP BALEENDAH',
            'alamatSekolah' => 'Jl. Adipati Agung No. 23, Baleendah, Kab. Bandung',
            'tahunAjaran' => '2025/2026',
            'namaWalikelas' => 'Admin Kurikulum',
            'kelasAmpu' => 'XII TKJ 1',
            'latGps' => -7.001759,
            'lngGps' => 107.623047,
            'radiusMeter' => 100,
            'footerApp' => 'Sistem Integrasi Sekolah',
            'logoSekolah' => '',
        ];
    }
    return [
        'namaSekolah' => (string)$row['nama_sekolah'],
        'alamatSekolah' => (string)$row['alamat_sekolah'],
        'tahunAjaran' => (string)$row['tahun_ajaran'],
        'namaWalikelas' => (string)$row['nama_walikelas'],
        'kelasAmpu' => (string)$row['kelas_ampu'],
        'latGps' => (float)$row['lat_gps'],
        'lngGps' => (float)$row['lng_gps'],
        'radiusMeter' => (int)$row['radius_meter'],
        'footerApp' => (string)$row['footer_app'],
        'logoSekolah' => (string)($row['logo_sekolah'] ?? ''),
    ];
}

function get_kalender_by_date(PDO $pdo, $targetDate) {
    $clean = substr(trim((string)$targetDate), 0, 10);
    $stmt = $pdo->prepare('SELECT * FROM kalender_pendidikan WHERE tanggal = ?');
    $stmt->execute([$clean]);
    $row = $stmt->fetch();
    if ($row) {
        $mode = (string)$row['mode_kbm'];
        $eff = (string)$row['status_efektif'];
        return [
            'id' => (int)$row['id'],
            'tanggal' => (string)$row['tanggal'],
            'modeKbm' => $mode,
            'statusEfektif' => $eff,
            'jamMulai' => (string)$row['jam_mulai'],
            'jamSelesai' => (string)$row['jam_selesai'],
            'keterangan' => (string)$row['keterangan'],
            'wajibGps' => (strtolower($mode) === 'luring' && strtolower($eff) === 'efektif'),
        ];
    }
    $isMinggu = ((int)date('w', strtotime($clean)) === 0);
    if ($isMinggu) {
        return [
            'id' => 0, 'tanggal' => $clean, 'modeKbm' => 'Libur', 'statusEfektif' => 'Tidak Efektif',
            'jamMulai' => '-', 'jamSelesai' => '-', 'keterangan' => 'Hari Minggu (Tidak Efektif KBM)', 'wajibGps' => false,
        ];
    }
    return [
        'id' => 0, 'tanggal' => $clean, 'modeKbm' => 'Luring', 'statusEfektif' => 'Efektif',
        'jamMulai' => '06:30', 'jamSelesai' => '16:00', 'keterangan' => 'KBM Luring Reguler (Wajib Radius GPS Sekolah)', 'wajibGps' => true,
    ];
}

function compute_live_rombel_status(PDO $pdo) {
    $todayStr = date('Y-m-d');
    $todayHari = get_nama_hari_wib($todayStr);
    $nowHHMM = date('H:i');
    $nowMin = time_to_minutes($nowHHMM);
    $kalender = get_kalender_by_date($pdo, $todayStr);

    $kelasRows = $pdo->query(
        "SELECT DISTINCT kelas FROM (SELECT kelas FROM siswa UNION SELECT kelas FROM jadwal_pelajaran) t
         WHERE kelas IS NOT NULL AND TRIM(kelas) != '' ORDER BY kelas ASC"
    )->fetchAll();

    $stmtJ = $pdo->prepare('SELECT * FROM jadwal_pelajaran WHERE LOWER(hari) = LOWER(?)');
    $stmtJ->execute([$todayHari]);
    $jadwalToday = $stmtJ->fetchAll();

    $stmtP = $pdo->prepare('SELECT * FROM kehadiran_pegawai WHERE tgl_absen = ?');
    $stmtP->execute([$todayStr]);
    $hadirPegawaiToday = $stmtP->fetchAll();

    $stmtJur = $pdo->prepare('SELECT * FROM jurnal_harian WHERE tanggal = ?');
    $stmtJur->execute([$todayStr]);
    $jurnalToday = $stmtJur->fetchAll();

    $currentSession = null;
    foreach (get_sesi_waktu_sekolah() as $sesi) {
        if ($nowMin >= time_to_minutes($sesi['mulai']) && $nowMin < time_to_minutes($sesi['selesai'])) {
            $currentSession = $sesi;
            break;
        }
    }

    $rombels = [];
    foreach ($kelasRows as $kr) {
        $kelas = (string)$kr['kelas'];
        $jadwalKelas = array_values(array_filter($jadwalToday, function($j) use ($kelas) {
            return (string)$j['kelas'] === $kelas;
        }));

        if (strtolower($kalender['modeKbm']) === 'libur' || strtolower($kalender['statusEfektif']) === 'tidak efektif') {
            $rombels[] = [
                'kelas' => $kelas, 'status' => 'OFF', 'colorState' => 'gray', 'guru' => '-',
                'mapel' => $kalender['keterangan'] ?: 'Libur / Tidak Efektif', 'jamKe' => '-', 'ruang' => '-',
                'guruCheckedIn' => false, 'jurnalFilled' => false,
            ];
            continue;
        }

        if (!$currentSession) {
            $isIstirahat = ($nowMin >= time_to_minutes('09:15') && $nowMin < time_to_minutes('09:30')) ||
                           ($nowMin >= time_to_minutes('11:45') && $nowMin < time_to_minutes('12:15'));
            $rombels[] = [
                'kelas' => $kelas, 'status' => $isIstirahat ? 'ISTIRAHAT' : 'OFF', 'colorState' => 'gray',
                'guru' => '-', 'mapel' => $isIstirahat ? 'Waktu Istirahat' : 'Di Luar Jam KBM',
                'jamKe' => '-', 'ruang' => '-', 'guruCheckedIn' => false, 'jurnalFilled' => false,
            ];
            continue;
        }

        $activeSlot = null;
        foreach ($jadwalKelas as $j) {
            $r = parse_jam_ke_range($j['jam']);
            if ($r['start'] !== null && $r['end'] !== null && $currentSession['jamKe'] >= $r['start'] && $currentSession['jamKe'] <= $r['end']) {
                $activeSlot = $j;
                break;
            }
        }

        if (!$activeSlot) {
            $rombels[] = [
                'kelas' => $kelas, 'status' => 'KOSONG', 'colorState' => 'gray', 'guru' => '-',
                'mapel' => 'Tidak Ada Jadwal KBM', 'jamKe' => $currentSession['label'], 'ruang' => '-',
                'guruCheckedIn' => false, 'jurnalFilled' => false,
            ];
            continue;
        }

        $guruName = (string)$activeSlot['guru'];
        $guruCheckedIn = false;
        foreach ($hadirPegawaiToday as $p) {
            if (strcasecmp((string)$p['nama'], $guruName) === 0 && strcasecmp((string)$p['status'], 'Hadir') === 0) {
                $guruCheckedIn = true;
                break;
            }
        }

        $jurnalFilled = false;
        foreach ($jurnalToday as $jur) {
            if (strcasecmp((string)$jur['kelas'], $kelas) !== 0 || strcasecmp((string)$jur['guru_nama'], $guruName) !== 0) {
                continue;
            }
            $jRange = parse_jam_ke_range($jur['jam_ke']);
            if ($jRange['start'] !== null && $jRange['end'] !== null) {
                if ($currentSession['jamKe'] >= $jRange['start'] && $currentSession['jamKe'] <= $jRange['end']) {
                    $jurnalFilled = true;
                    break;
                }
            } elseif (strcasecmp((string)$jur['mapel'], (string)$activeSlot['mapel']) === 0) {
                $jurnalFilled = true;
                break;
            }
        }

        if ($jurnalFilled) {
            $status = 'MENGAJAR'; $colorState = 'green';
        } elseif ($guruCheckedIn) {
            $status = 'TERLAMBAT'; $colorState = 'yellow';
        } else {
            $status = 'BELUM HADIR'; $colorState = 'red';
        }

        $rombels[] = [
            'kelas' => $kelas, 'status' => $status, 'colorState' => $colorState,
            'guru' => $guruName, 'mapel' => (string)$activeSlot['mapel'],
            'jamKe' => (string)$activeSlot['jam'], 'ruang' => (string)$activeSlot['ruang'],
            'guruCheckedIn' => $guruCheckedIn, 'jurnalFilled' => $jurnalFilled,
        ];
    }

    $pegawaiList = array_map(function($p) {
        return [
            'id' => (int)$p['id'], 'tglAbsen' => (string)$p['tgl_absen'], 'waktuInput' => (string)$p['waktu_input'],
            'nipUser' => (string)$p['nip_user'], 'nama' => (string)$p['nama'], 'roleJabatan' => (string)$p['role_jabatan'],
            'jk' => (string)$p['jk'], 'status' => (string)$p['status'], 'jarakMeter' => (string)$p['jarak_meter'],
        ];
    }, $hadirPegawaiToday);

    return [
        'todayStr' => $todayStr,
        'todayHari' => $todayHari,
        'nowHHMM' => $nowHHMM,
        'currentSession' => $currentSession,
        'kalender' => $kalender,
        'hadirPegawaiToday' => $pegawaiList,
        'rombels' => $rombels,
    ];
}

function find_jadwal_conflict(PDO $pdo, $hari, $jam, $kelas, $guru) {
    $cleanHari = trim((string)$hari);
    $cleanJam = trim((string)$jam);
    $cleanKelas = trim((string)$kelas);
    $cleanGuru = trim((string)$guru);
    $newRange = parse_jam_ke_range($cleanJam);

    $stmt = $pdo->prepare('SELECT * FROM jadwal_pelajaran WHERE LOWER(TRIM(hari)) = LOWER(TRIM(?))');
    $stmt->execute([$cleanHari]);
    $rows = $stmt->fetchAll();

    $isOverlap = function($exJam) use ($newRange, $cleanJam) {
        $exRange = parse_jam_ke_range($exJam);
        if ($newRange['start'] !== null && $newRange['end'] !== null && $exRange['start'] !== null && $exRange['end'] !== null) {
            return $newRange['start'] <= $exRange['end'] && $newRange['end'] >= $exRange['start'];
        }
        return strcasecmp($cleanJam, trim((string)$exJam)) === 0;
    };

    foreach ($rows as $r) {
        if (strcasecmp(trim((string)$r['kelas']), $cleanKelas) === 0 && $isOverlap($r['jam'])) {
            return [
                'conflict' => true,
                'message' => "Peringatan! Kelas {$cleanKelas} pada hari {$cleanHari} ({$r['jam']}) sudah memiliki jadwal mengajar oleh {$r['guru']} ({$r['mapel']}). Jadwal di kelas & jam yang sama tidak bisa disimpan.",
            ];
        }
    }
    foreach ($rows as $r) {
        if (strcasecmp(trim((string)$r['guru']), $cleanGuru) === 0 && $isOverlap($r['jam'])) {
            return [
                'conflict' => true,
                'message' => "Peringatan! Guru {$cleanGuru} sudah memiliki jadwal mengajar di kelas {$r['kelas']} pada hari {$cleanHari} ({$r['jam']}). Tidak bisa membuat jadwal bentrok pada jam yang sama.",
            ];
        }
    }
    return ['conflict' => false, 'message' => ''];
}

// === ROUTE PARSING ===
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$route = $_GET['_route'] ?? ($_SERVER['PATH_INFO'] ?? '');
if ($route === '') {
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $posPhp = strpos($uriPath, '/api.php/');
    if ($posPhp !== false) {
        $route = substr($uriPath, $posPhp + 8);
    } else {
        $pos = strpos($uriPath, '/api/');
        if ($pos !== false) {
            $route = substr($uriPath, $pos + 4);
        }
    }
}
$route = '/' . ltrim((string)$route, '/');

$pdo = get_pdo();

// 1. PUBLIC META
if ($method === 'GET' && $route === '/public/meta') {
    $todayStr = date('Y-m-d');
    json_response([
        'adminClaimed' => is_admin_claimed($pdo),
        'mysqlConfigured' => true,
        'supabaseConfigured' => false,
        'pengaturan' => get_pengaturan($pdo),
        'kalenderHariIni' => get_kalender_by_date($pdo, $todayStr),
        'serverTime' => [
            'todayStr' => $todayStr,
            'timeStr' => date('H:i:s'),
            'hhmmStr' => date('H:i'),
            'timestampMs' => (int)(microtime(true) * 1000),
        ],
    ]);
}

// 2. CLAIM ADMIN
if ($method === 'POST' && $route === '/auth/claim-admin') {
    if (is_admin_claimed($pdo)) {
        json_response(['status' => false, 'message' => 'Akun Admin sudah diaktivasi sebelumnya.'], 403);
    }
    $body = get_json_body();
    $adminPass = trim((string)($body['adminPassword'] ?? ''));
    $staffPass = trim((string)($body['staffPassword'] ?? ''));
    if (strlen($adminPass) < 6) {
        json_response(['status' => false, 'message' => 'Password Admin minimal 6 karakter.'], 400);
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'")->execute([hash_password_php($adminPass)]);
        if (strlen($staffPass) >= 4) {
            $pdo->prepare("UPDATE users SET password_hash = ? WHERE role IN ('guru', 'karyawan')")
                ->execute([hash_password_php($staffPass)]);
        }
        $pdo->prepare("INSERT INTO auth_meta (`key`, value) VALUES ('admin_claimed', 'true') ON DUPLICATE KEY UPDATE value = 'true'")->execute();
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_response(['status' => false, 'message' => 'Gagal aktivasi admin: ' . $e->getMessage()], 500);
    }

    $adminRow = $pdo->query("SELECT * FROM users WHERE username = 'admin'")->fetch();
    $user = [
        'id' => (int)$adminRow['id'],
        'username' => (string)$adminRow['username'],
        'role' => 'admin',
        'nama' => (string)$adminRow['nama'],
        'nisNip' => (string)$adminRow['nis_nip'],
        'kelas' => (string)$adminRow['kelas'],
        'jk' => (string)$adminRow['jk'],
    ];
    $token = sign_token($pdo, array_merge($user, ['exp' => (int)(microtime(true) * 1000) + 12 * 3600 * 1000]));
    json_response(['status' => true, 'token' => $token, 'user' => $user]);
}

// 3. LOGIN
if ($method === 'POST' && $route === '/auth/login') {
    $body = get_json_body();
    $inputVal = trim((string)($body['username'] ?? ''));
    $inputPass = trim((string)($body['password'] ?? ''));
    if ($inputVal === '') {
        json_response(['status' => false, 'message' => 'Masukkan NIS atau Username.'], 400);
    }

    $stmtS = $pdo->prepare('SELECT * FROM siswa WHERE LOWER(TRIM(nis)) = LOWER(?) LIMIT 1');
    $stmtS->execute([$inputVal]);
    $siswaRow = $stmtS->fetch();
    if ($siswaRow) {
        $user = [
            'id' => (int)$siswaRow['id'], 'username' => (string)$siswaRow['nis'], 'role' => 'siswa',
            'nama' => (string)$siswaRow['nama'], 'nisNip' => (string)$siswaRow['nis'],
            'kelas' => (string)$siswaRow['kelas'], 'jurusan' => (string)$siswaRow['jurusan'],
            'jk' => (string)$siswaRow['jk'], 'tempatPkl' => (string)$siswaRow['tempat_pkl'],
            'nilaiSm1' => (string)$siswaRow['nilai_sm1'], 'nilaiSm2' => (string)$siswaRow['nilai_sm2'],
            'statusSm1' => (string)$siswaRow['status_sm1'], 'statusSm2' => (string)$siswaRow['status_sm2'],
            'tugasBelumSm1' => (string)$siswaRow['tugas_belum_sm1'], 'tugasBelumSm2' => (string)$siswaRow['tugas_belum_sm2'],
        ];
        $token = sign_token($pdo, array_merge($user, ['exp' => (int)(microtime(true) * 1000) + 12 * 3600 * 1000]));
        json_response(['status' => true, 'token' => $token, 'user' => $user]);
    }

    $stmtU = $pdo->prepare('SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?) OR LOWER(TRIM(nis_nip)) = LOWER(?) LIMIT 1');
    $stmtU->execute([$inputVal, $inputVal]);
    $userRow = $stmtU->fetch();
    if (!$userRow) {
        json_response(['status' => false, 'message' => 'NIS atau Username tidak ditemukan. Pastikan penulisan benar.'], 401);
    }
    if ($inputPass === '') {
        json_response(['status' => false, 'message' => 'Masukkan kata sandi untuk akun Admin, Guru, atau Karyawan.'], 401);
    }

    $role = strtolower((string)$userRow['role']);
    $storedHash = (string)($userRow['password_hash'] ?? '');
    $adminPasscode = trim(env_val('ADMIN_PASSCODE', ''));
    $passwordValid = false;
    if ($role === 'admin' && $adminPasscode !== '') {
        $passwordValid = hash_equals($adminPasscode, $inputPass) || ($storedHash !== '' && verify_password_php($inputPass, $storedHash));
    } else {
        $passwordValid = verify_password_php($inputPass, $storedHash);
    }

    if (!$passwordValid) {
        json_response(['status' => false, 'message' => 'Kata sandi salah. Periksa kembali password Anda.'], 401);
    }

    $user = [
        'id' => (int)$userRow['id'], 'username' => (string)$userRow['username'], 'role' => $role,
        'nama' => (string)$userRow['nama'], 'nisNip' => (string)$userRow['nis_nip'],
        'kelas' => (string)$userRow['kelas'], 'jk' => (string)$userRow['jk'],
    ];
    $token = sign_token($pdo, array_merge($user, ['exp' => (int)(microtime(true) * 1000) + 12 * 3600 * 1000]));
    json_response(['status' => true, 'token' => $token, 'user' => $user]);
}

// 4. BOOTSTRAP
if ($method === 'GET' && $route === '/bootstrap') {
    $user = require_auth($pdo);
    $todayStr = date('Y-m-d');
    $pengaturan = get_pengaturan($pdo);
    $kalenderHariIni = get_kalender_by_date($pdo, $todayStr);
    $mapel = array_map(function($r) { return (string)$r['nama']; }, $pdo->query('SELECT nama FROM master_mapel ORDER BY nama ASC')->fetchAll());
    $hakAkses = array_map(function($r) {
        return [
            'id' => (string)$r['id'], 'nama' => (string)$r['nama'],
            'admin' => (bool)$r['admin'], 'guru' => (bool)$r['guru'],
            'karyawan' => (bool)$r['karyawan'], 'siswa' => (bool)$r['siswa'],
        ];
    }, $pdo->query('SELECT * FROM hak_akses_role')->fetchAll());
    $kalender = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'tanggal' => (string)$r['tanggal'], 'modeKbm' => (string)$r['mode_kbm'],
            'statusEfektif' => (string)$r['status_efektif'], 'jamMulai' => (string)$r['jam_mulai'],
            'jamSelesai' => (string)$r['jam_selesai'], 'keterangan' => (string)$r['keterangan'],
        ];
    }, $pdo->query('SELECT * FROM kalender_pendidikan ORDER BY tanggal DESC')->fetchAll());
    $agenda = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'tanggal' => (string)$r['tanggal'], 'judul' => (string)$r['judul'],
            'kategori' => (string)$r['kategori'], 'keterangan' => (string)$r['keterangan'],
        ];
    }, $pdo->query('SELECT * FROM agenda_akademik ORDER BY tanggal DESC, id DESC')->fetchAll());
    $jurusan = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'kode' => (string)$r['kode'], 'nama' => (string)$r['nama'],
            'kurikulum' => (string)$r['kurikulum'], 'fasilitas' => (string)$r['fasilitas'],
        ];
    }, $pdo->query('SELECT * FROM data_jurusan ORDER BY kode ASC')->fetchAll());

    $serverTime = [
        'todayStr' => $todayStr, 'timeStr' => date('H:i:s'),
        'hhmmStr' => date('H:i'), 'timestampMs' => (int)(microtime(true) * 1000),
    ];

    if ($user['role'] === 'siswa') {
        $stK = $pdo->prepare('SELECT * FROM kehadiran_siswa WHERE LOWER(nis) = LOWER(?) ORDER BY tgl_absen DESC, id DESC');
        $stK->execute([$user['nisNip']]);
        $kehadiran = array_map(function($r) {
            return [
                'id' => (int)$r['id'], 'tglAbsen' => (string)$r['tgl_absen'], 'waktuInput' => (string)$r['waktu_input'],
                'nis' => (string)$r['nis'], 'nama' => (string)$r['nama'], 'kelas' => (string)$r['kelas'],
                'jurusan' => (string)$r['jurusan'], 'jk' => (string)$r['jk'], 'status' => (string)$r['status'],
                'jarakMeter' => (string)$r['jarak_meter'],
            ];
        }, $stK->fetchAll());

        $stPb = $pdo->prepare('SELECT * FROM pembinaan_siswa WHERE LOWER(nis) = LOWER(?) ORDER BY id DESC');
        $stPb->execute([$user['nisNip']]);
        $pembinaan = array_map(function($r) {
            return [
                'id' => (int)$r['id'], 'waktuInput' => (string)$r['waktu_input'], 'tanggal' => (string)$r['tanggal'],
                'nis' => (string)$r['nis'], 'nama' => (string)$r['nama'], 'kelas' => (string)$r['kelas'],
                'guruPembina' => (string)$r['guru_pembina'], 'jenis' => (string)$r['jenis'],
                'poin' => (int)$r['poin'], 'uraian' => (string)$r['uraian'], 'solusi' => (string)$r['solusi'],
            ];
        }, $stPb->fetchAll());

        $stT = $pdo->prepare('SELECT * FROM pengumpulan_tugas WHERE LOWER(nis) = LOWER(?) ORDER BY waktu_pengiriman DESC');
        $stT->execute([$user['nisNip']]);
        $historiTugas = array_map(function($r) {
            return [
                'idPengumpulan' => (string)$r['id_pengumpulan'], 'waktuPengiriman' => (string)$r['waktu_pengiriman'],
                'nis' => (string)$r['nis'], 'namaSiswa' => (string)$r['nama_siswa'], 'kelas' => (string)$r['kelas'],
                'tanggalTugas' => (string)$r['tanggal_tugas'], 'mapel' => (string)$r['mapel'],
                'keterangan' => (string)$r['keterangan'], 'namaFile' => (string)$r['nama_file'],
                'status' => (string)$r['status'], 'nilaiTugas' => (string)($r['nilai_tugas'] ?? ''),
                'catatanNilai' => (string)($r['catatan_nilai'] ?? ''),
            ];
        }, $stT->fetchAll());

        $stJ = $pdo->prepare('SELECT * FROM jadwal_pelajaran WHERE kelas = ? ORDER BY id ASC');
        $stJ->execute([$user['kelas']]);
        $jadwal = array_map(function($r) {
            return [
                'id' => (int)$r['id'], 'hari' => (string)$r['hari'], 'jam' => (string)$r['jam'],
                'kelas' => (string)$r['kelas'], 'mapel' => (string)$r['mapel'],
                'guru' => (string)$r['guru'], 'ruang' => (string)$r['ruang'],
            ];
        }, $stJ->fetchAll());

        json_response([
            'authenticated' => true, 'adminClaimed' => is_admin_claimed($pdo),
            'mysqlConfigured' => true, 'supabaseConfigured' => false, 'serverTime' => $serverTime,
            'pengaturan' => $pengaturan, 'kalenderHariIni' => $kalenderHariIni, 'mapel' => $mapel,
            'siswa' => [], 'kehadiran' => $kehadiran, 'kehadiranPegawai' => [],
            'historiTugas' => $historiTugas, 'pembinaan' => $pembinaan, 'jurnal' => [],
            'users' => [], 'jurusan' => $jurusan, 'jadwal' => $jadwal, 'agenda' => $agenda,
            'kalender' => $kalender, 'hakAkses' => $hakAkses,
        ]);
    }

    $siswa = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'nis' => (string)$r['nis'], 'nama' => (string)$r['nama'],
            'kelas' => (string)$r['kelas'], 'jurusan' => (string)$r['jurusan'], 'jk' => (string)$r['jk'],
            'tempatPkl' => (string)($r['tempat_pkl'] ?: '-'), 'nilaiSm1' => (string)($r['nilai_sm1'] ?: '-'),
            'nilaiSm2' => (string)($r['nilai_sm2'] ?: '-'), 'statusSm1' => (string)($r['status_sm1'] ?: '-'),
            'statusSm2' => (string)($r['status_sm2'] ?: '-'), 'tugasBelumSm1' => (string)($r['tugas_belum_sm1'] ?: '-'),
            'tugasBelumSm2' => (string)($r['tugas_belum_sm2'] ?: '-'),
        ];
    }, $pdo->query('SELECT * FROM siswa ORDER BY kelas ASC, nama ASC')->fetchAll());

    $kehadiran = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'tglAbsen' => (string)$r['tgl_absen'], 'waktuInput' => (string)$r['waktu_input'],
            'nis' => (string)$r['nis'], 'nama' => (string)$r['nama'], 'kelas' => (string)$r['kelas'],
            'jurusan' => (string)$r['jurusan'], 'jk' => (string)$r['jk'], 'status' => (string)$r['status'],
            'jarakMeter' => (string)$r['jarak_meter'],
        ];
    }, $pdo->query('SELECT * FROM kehadiran_siswa ORDER BY tgl_absen DESC, id DESC LIMIT 1000')->fetchAll());

    if ($user['role'] === 'admin') {
        $pegRows = $pdo->query('SELECT * FROM kehadiran_pegawai ORDER BY tgl_absen DESC, id DESC LIMIT 500')->fetchAll();
    } else {
        $stP = $pdo->prepare('SELECT * FROM kehadiran_pegawai WHERE LOWER(nip_user) = LOWER(?) OR LOWER(nip_user) = LOWER(?) OR LOWER(nama) = LOWER(?) ORDER BY tgl_absen DESC, id DESC');
        $stP->execute([$user['username'], $user['nisNip'], $user['nama']]);
        $pegRows = $stP->fetchAll();
    }
    $kehadiranPegawai = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'tglAbsen' => (string)$r['tgl_absen'], 'waktuInput' => (string)$r['waktu_input'],
            'nipUser' => (string)$r['nip_user'], 'nama' => (string)$r['nama'], 'roleJabatan' => (string)$r['role_jabatan'],
            'jk' => (string)$r['jk'], 'status' => (string)$r['status'], 'jarakMeter' => (string)$r['jarak_meter'],
        ];
    }, $pegRows);

    $pembinaan = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'waktuInput' => (string)$r['waktu_input'], 'tanggal' => (string)$r['tanggal'],
            'nis' => (string)$r['nis'], 'nama' => (string)$r['nama'], 'kelas' => (string)$r['kelas'],
            'guruPembina' => (string)$r['guru_pembina'], 'jenis' => (string)$r['jenis'],
            'poin' => (int)$r['poin'], 'uraian' => (string)$r['uraian'], 'solusi' => (string)$r['solusi'],
        ];
    }, $pdo->query('SELECT * FROM pembinaan_siswa ORDER BY id DESC')->fetchAll());

    if ($user['role'] === 'admin') {
        $jurRows = $pdo->query('SELECT * FROM jurnal_harian ORDER BY id DESC')->fetchAll();
    } else {
        $stJr = $pdo->prepare('SELECT * FROM jurnal_harian WHERE LOWER(guru_nama) = LOWER(?) ORDER BY id DESC');
        $stJr->execute([$user['nama']]);
        $jurRows = $stJr->fetchAll();
    }
    $jurnal = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'waktuInput' => (string)$r['waktu_input'], 'tanggal' => (string)$r['tanggal'],
            'guruNama' => (string)$r['guru_nama'], 'jamKe' => (string)$r['jam_ke'], 'kelas' => (string)$r['kelas'],
            'mapel' => (string)$r['mapel'], 'tujuan' => (string)$r['tujuan'], 'materi' => (string)$r['materi'],
            'metode' => (string)$r['metode'], 'refleksi' => (string)$r['refleksi'], 'tugas' => (string)$r['tugas'],
            'nilaiProgres' => (string)$r['nilai_progres'], 'fotoUrl' => (string)$r['foto_url'],
        ];
    }, $jurRows);

    if ($user['role'] === 'admin') {
        $jadRows = $pdo->query('SELECT * FROM jadwal_pelajaran ORDER BY hari ASC, id ASC')->fetchAll();
    } else {
        $stJd = $pdo->prepare('SELECT * FROM jadwal_pelajaran WHERE LOWER(guru) = LOWER(?) ORDER BY hari ASC, id ASC');
        $stJd->execute([$user['nama']]);
        $jadRows = $stJd->fetchAll();
    }
    $jadwal = array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'hari' => (string)$r['hari'], 'jam' => (string)$r['jam'],
            'kelas' => (string)$r['kelas'], 'mapel' => (string)$r['mapel'],
            'guru' => (string)$r['guru'], 'ruang' => (string)$r['ruang'],
        ];
    }, $jadRows);

    $users = ($user['role'] === 'admin') ? array_map(function($r) {
        return [
            'id' => (int)$r['id'], 'username' => (string)$r['username'], 'role' => (string)$r['role'],
            'nama' => (string)$r['nama'], 'nisNip' => (string)$r['nis_nip'],
            'kelas' => (string)$r['kelas'], 'jk' => (string)$r['jk'],
        ];
    }, $pdo->query('SELECT id, username, role, nama, nis_nip, kelas, jk FROM users ORDER BY id ASC')->fetchAll()) : [];

    $historiTugas = ($user['role'] === 'admin') ? array_map(function($r) {
        return [
            'idPengumpulan' => (string)$r['id_pengumpulan'], 'waktuPengiriman' => (string)$r['waktu_pengiriman'],
            'nis' => (string)$r['nis'], 'namaSiswa' => (string)$r['nama_siswa'], 'kelas' => (string)$r['kelas'],
            'tanggalTugas' => (string)$r['tanggal_tugas'], 'mapel' => (string)$r['mapel'],
            'keterangan' => (string)$r['keterangan'], 'namaFile' => (string)$r['nama_file'],
            'status' => (string)$r['status'], 'nilaiTugas' => (string)($r['nilai_tugas'] ?? ''),
            'catatanNilai' => (string)($r['catatan_nilai'] ?? ''),
        ];
    }, $pdo->query('SELECT * FROM pengumpulan_tugas ORDER BY waktu_pengiriman DESC')->fetchAll()) : [];

    json_response([
        'authenticated' => true, 'adminClaimed' => is_admin_claimed($pdo),
        'mysqlConfigured' => true, 'supabaseConfigured' => false, 'serverTime' => $serverTime,
        'pengaturan' => $pengaturan, 'kalenderHariIni' => $kalenderHariIni, 'mapel' => $mapel,
        'siswa' => $siswa, 'kehadiran' => $kehadiran, 'kehadiranPegawai' => $kehadiranPegawai,
        'historiTugas' => $historiTugas, 'pembinaan' => $pembinaan, 'jurnal' => $jurnal,
        'users' => $users, 'jurusan' => $jurusan, 'jadwal' => $jadwal, 'agenda' => $agenda,
        'kalender' => $kalender, 'hakAkses' => $hakAkses,
    ]);
}

// 5. LIVE ROMBEL
if ($method === 'GET' && $route === '/live-rombel') {
    require_auth($pdo, ['admin', 'guru', 'karyawan']);
    json_response(['status' => true, 'data' => compute_live_rombel_status($pdo)]);
}

// 6. PRESENSI GPS
if ($method === 'POST' && $route === '/presensi/gps') {
    $user = require_auth($pdo);
    $todayStr = date('Y-m-d');
    $waktuFormatted = date('H:i');
    $kalender = get_kalender_by_date($pdo, $todayStr);

    if (strtolower($kalender['statusEfektif']) === 'tidak efektif' || strtolower($kalender['modeKbm']) === 'libur') {
        json_response(['status' => false, 'message' => "Presensi ditutup. Hari ini terjadwal {$kalender['modeKbm']} ({$kalender['statusEfektif']})."], 400);
    }

    if ($user['role'] === 'siswa') {
        $st = $pdo->prepare('SELECT * FROM kehadiran_siswa WHERE tgl_absen = ? AND LOWER(nis) = LOWER(?) LIMIT 1');
        $st->execute([$todayStr, $user['nisNip']]);
        if ($ex = $st->fetch()) {
            json_response(['status' => false, 'alreadyCheckedIn' => true, 'message' => "Anda sudah melakukan Presensi pada pukul {$ex['waktu_input']} WIB. Jam absen terkunci."], 409);
        }
    } else {
        $st = $pdo->prepare('SELECT * FROM kehadiran_pegawai WHERE tgl_absen = ? AND (LOWER(nip_user) = LOWER(?) OR LOWER(nip_user) = LOWER(?) OR LOWER(nama) = LOWER(?)) LIMIT 1');
        $st->execute([$todayStr, $user['nisNip'], $user['username'], $user['nama']]);
        if ($ex = $st->fetch()) {
            json_response(['status' => false, 'alreadyCheckedIn' => true, 'message' => "Anda sudah melakukan Presensi GPS pada pukul {$ex['waktu_input']} WIB. Jam presensi terkunci agar tidak berubah."], 409);
        }
    }

    $body = get_json_body();
    $userLat = isset($body['userLat']) && is_numeric($body['userLat']) ? (float)$body['userLat'] : null;
    $userLng = isset($body['userLng']) && is_numeric($body['userLng']) ? (float)$body['userLng'] : null;
    $cfg = get_pengaturan($pdo);
    $infoJarak = 'Daring (GPS Nonaktif)';

    if (strtolower($kalender['modeKbm']) === 'luring') {
        if ($userLat === null || $userLng === null) {
            json_response(['status' => false, 'message' => 'KBM Luring mewajibkan deteksi lokasi GPS.'], 400);
        }
        $jarak = (int)round(hitung_jarak_meter($userLat, $userLng, $cfg['latGps'], $cfg['lngGps']));
        if ($jarak > $cfg['radiusMeter']) {
            json_response(['status' => false, 'message' => "Presensi Luring Gagal! Jarak Anda {$jarak} meter (Maksimal {$cfg['radiusMeter']} meter)."], 400);
        }
        $infoJarak = "{$jarak} meter (Luring)";
    } elseif ($userLat !== null && $userLng !== null) {
        $jarakDaring = (int)round(hitung_jarak_meter($userLat, $userLng, $cfg['latGps'], $cfg['lngGps']));
        $infoJarak = "Daring ({$jarakDaring}m - Bebas Radius)";
    }

    if ($user['role'] === 'siswa') {
        $pdo->prepare('INSERT INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$todayStr, $waktuFormatted, $user['nisNip'], $user['nama'], $user['kelas'], $user['jurusan'] ?? '-', $user['jk'] ?? '-', 'Hadir', $infoJarak]);
    } else {
        $nipId = $user['nisNip'] ?: $user['username'];
        $pdo->prepare('INSERT INTO kehadiran_pegawai (tgl_absen, waktu_input, nip_user, nama, role_jabatan, jk, status, jarak_meter) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$todayStr, $waktuFormatted, $nipId, $user['nama'], strtoupper($user['role']), $user['jk'] ?? 'L', 'Hadir', $infoJarak]);
    }

    json_response([
        'status' => true, 'tglAbsen' => $todayStr, 'waktuInput' => $waktuFormatted, 'jarakMeter' => $infoJarak,
        'message' => "Presensi ({$kalender['modeKbm']}) berhasil tercatat pada {$todayStr} pukul {$waktuFormatted} WIB.",
    ]);
}

// 7. PEGAWAI MANUAL PRESENSI
if ($method === 'POST' && $route === '/pegawai/presensi') {
    require_auth($pdo, ['admin']);
    $body = get_json_body();
    $tgl = $body['tglAbsen'] ?? ''; $nip = $body['nipUser'] ?? ''; $nama = $body['nama'] ?? ''; $status = $body['status'] ?? '';
    if (!$tgl || !$nip || !$nama || !$status) {
        json_response(['status' => false, 'message' => 'Data presensi pegawai tidak lengkap.'], 400);
    }
    $pdo->prepare(
        'INSERT INTO kehadiran_pegawai (tgl_absen, waktu_input, nip_user, nama, role_jabatan, jk, status, jarak_meter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE waktu_input = VALUES(waktu_input), status = VALUES(status), jarak_meter = VALUES(jarak_meter)'
    )->execute([$tgl, date('H:i'), $nip, $nama, $body['roleJabatan'] ?? 'GURU', 'L', $status, $body['jarakMeter'] ?? 'Input Admin']);
    json_response(['status' => true, 'message' => "Status presensi {$nama} disimpan ({$status})."]);
}

if ($method === 'DELETE' && preg_match('#^/pegawai/presensi/(\d+)$#', $route, $m)) {
    require_auth($pdo, ['admin']);
    $pdo->prepare('DELETE FROM kehadiran_pegawai WHERE id = ?')->execute([(int)$m[1]]);
    json_response(['status' => true, 'message' => 'Log presensi pegawai berhasil dihapus.']);
}

// 8. ABSENSI BATCH
if ($method === 'POST' && $route === '/absensi/batch') {
    require_auth($pdo, ['admin', 'guru']);
    $body = get_json_body();
    $batch = $body['batch'] ?? [];
    if (!is_array($batch) || count($batch) === 0) {
        json_response(['status' => false, 'message' => 'Daftar siswa kosong.'], 400);
    }
    $jam = date('H:i');
    $stmt = $pdo->prepare(
        "INSERT INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Input Guru Kelas')
         ON DUPLICATE KEY UPDATE waktu_input = VALUES(waktu_input), kelas = VALUES(kelas), status = VALUES(status)"
    );
    $pdo->beginTransaction();
    try {
        foreach ($batch as $item) {
            $stmt->execute([
                $item['tglAbsen'] ?? date('Y-m-d'), $jam, $item['nis'] ?? '', $item['nama'] ?? '',
                $item['kelas'] ?? '', $item['jurusan'] ?? '-', $item['jk'] ?? 'L', $item['status'] ?? 'Hadir',
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_response(['status' => false, 'message' => $e->getMessage()], 500);
    }
    json_response(['status' => true, 'message' => 'Presensi kelas berhasil disimpan!']);
}

// 9. JURNAL HARIAN
if ($method === 'POST' && $route === '/jurnal') {
    $user = require_auth($pdo, ['admin', 'guru']);
    $body = get_json_body();
    $tanggal = $body['tanggal'] ?? ''; $jamKe = $body['jamKe'] ?? ''; $kelas = $body['kelas'] ?? '';
    $mapel = $body['mapel'] ?? ''; $materi = $body['materi'] ?? '';
    if (!$tanggal || !$jamKe || !$kelas || !$mapel || !$materi) {
        json_response(['status' => false, 'message' => 'Tanggal, jam ke, kelas, mapel, dan materi wajib diisi.'], 400);
    }
    if ($user['role'] === 'guru') {
        $hariKbm = get_nama_hari_wib($tanggal);
        $stM = $pdo->prepare('SELECT id FROM jadwal_pelajaran WHERE LOWER(hari) = LOWER(?) AND kelas = ? AND LOWER(mapel) = LOWER(?) AND LOWER(guru) = LOWER(?) LIMIT 1');
        $stM->execute([$hariKbm, trim($kelas), trim($mapel), $user['nama']]);
        if (!$stM->fetch()) {
            json_response(['status' => false, 'message' => "Anda wajib membuat jadwal di Master Kelola Jadwal Mengajar Guru untuk hari {$hariKbm} ({$kelas} - {$mapel}) sebelum mengisi Jurnal Harian."], 400);
        }
    }

    $waktuInput = date('Y-m-d H:i');
    $waktuJam = date('H:i');
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO jurnal_harian (waktu_input, tanggal, guru_nama, jam_ke, kelas, mapel, tujuan, materi, metode, refleksi, tugas, nilai_progres, foto_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $waktuInput, $tanggal, $user['nama'], $jamKe, $kelas, $mapel,
            $body['tujuan'] ?? '-', $materi, $body['metode'] ?? '-', $body['refleksi'] ?? '-',
            $body['tugas'] ?? '-', $body['nilaiProgres'] ?? '-', $body['fotoUrl'] ?? '-',
        ]);
        if (!empty($body['absensiBatch']) && is_array($body['absensiBatch'])) {
            $stA = $pdo->prepare(
                "INSERT INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Jurnal KBM Guru')
                 ON DUPLICATE KEY UPDATE waktu_input = VALUES(waktu_input), status = VALUES(status)"
            );
            foreach ($body['absensiBatch'] as $item) {
                $stA->execute([
                    $tanggal, $waktuJam, $item['nis'] ?? '', $item['nama'] ?? '',
                    $item['kelas'] ?? $kelas, $item['jurusan'] ?? '-', $item['jk'] ?? 'L', $item['status'] ?? 'Hadir',
                ]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_response(['status' => false, 'message' => $e->getMessage()], 500);
    }
    json_response(['status' => true, 'message' => 'Jurnal Harian & Absensi KBM berhasil disimpan!']);
}

// 10. PEMBINAAN SISWA
if ($method === 'POST' && $route === '/pembinaan') {
    $user = require_auth($pdo, ['admin', 'guru']);
    $b = get_json_body();
    if (empty($b['tanggal']) || empty($b['nis']) || empty($b['nama']) || empty($b['uraian']) || empty($b['solusi'])) {
        json_response(['status' => false, 'message' => 'Lengkapi seluruh data pembinaan siswa.'], 400);
    }
    $pdo->prepare(
        'INSERT INTO pembinaan_siswa (waktu_input, tanggal, nis, nama, kelas, guru_pembina, jenis, poin, uraian, solusi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        date('Y-m-d H:i'), $b['tanggal'], $b['nis'], $b['nama'], $b['kelas'] ?? '',
        $user['nama'], $b['jenis'] ?? 'Pelanggaran', (int)($b['poin'] ?? 0), $b['uraian'], $b['solusi'],
    ]);
    json_response(['status' => true, 'message' => 'Catatan pembinaan berhasil disimpan!']);
}

// 11. CRUD SISWA
if ($method === 'POST' && $route === '/siswa') {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    if (empty($b['nis']) || empty($b['nama']) || empty($b['kelas']) || empty($b['jurusan'])) {
        json_response(['status' => false, 'message' => 'NIS, Nama, Kelas, dan Jurusan wajib diisi.'], 400);
    }
    try {
        $pdo->prepare(
            'INSERT INTO siswa (nis, nama, kelas, jurusan, jk, tempat_pkl, nilai_sm1, nilai_sm2, status_sm1, status_sm2, tugas_belum_sm1, tugas_belum_sm2)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            trim($b['nis']), trim($b['nama']), trim($b['kelas']), trim($b['jurusan']), trim($b['jk'] ?? 'L'),
            $b['tempatPkl'] ?? '-', $b['nilaiSm1'] ?? '-', $b['nilaiSm2'] ?? '-',
            $b['statusSm1'] ?? '-', $b['statusSm2'] ?? '-', $b['tugasBelumSm1'] ?? '-', $b['tugasBelumSm2'] ?? '-',
        ]);
        json_response(['status' => true, 'message' => 'Siswa baru berhasil ditambahkan!']);
    } catch (Throwable $e) {
        json_response(['status' => false, 'message' => 'NIS sudah terdaftar atau data tidak valid.'], 400);
    }
}

if ($method === 'PUT' && preg_match('#^/siswa/(\d+)$#', $route, $m)) {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    if (empty($b['nis']) || empty($b['nama']) || empty($b['kelas']) || empty($b['jurusan'])) {
        json_response(['status' => false, 'message' => 'NIS, Nama, Kelas, dan Jurusan wajib diisi.'], 400);
    }
    $pdo->prepare(
        'UPDATE siswa SET nis=?, nama=?, kelas=?, jurusan=?, jk=?, tempat_pkl=?, nilai_sm1=?, nilai_sm2=?, status_sm1=?, status_sm2=?, tugas_belum_sm1=?, tugas_belum_sm2=? WHERE id=?'
    )->execute([
        trim($b['nis']), trim($b['nama']), trim($b['kelas']), trim($b['jurusan']), trim($b['jk'] ?? 'L'),
        $b['tempatPkl'] ?? '-', $b['nilaiSm1'] ?? '-', $b['nilaiSm2'] ?? '-',
        $b['statusSm1'] ?? '-', $b['statusSm2'] ?? '-', $b['tugasBelumSm1'] ?? '-', $b['tugasBelumSm2'] ?? '-', (int)$m[1],
    ]);
    json_response(['status' => true, 'message' => 'Data siswa berhasil diperbarui!']);
}

if ($method === 'DELETE' && preg_match('#^/siswa/(\d+)$#', $route, $m)) {
    require_auth($pdo, ['admin']);
    $pdo->prepare('DELETE FROM siswa WHERE id = ?')->execute([(int)$m[1]]);
    json_response(['status' => true, 'message' => 'Data siswa berhasil dihapus.']);
}

// 12. JADWAL MENGAJAR
if ($method === 'GET' && $route === '/jadwal/check-conflict') {
    $user = require_auth($pdo, ['admin', 'guru']);
    $hari = trim((string)($_GET['hari'] ?? ''));
    $jam = trim((string)($_GET['jam'] ?? ''));
    $kelas = trim((string)($_GET['kelas'] ?? ''));
    $guruParam = trim((string)($_GET['guru'] ?? ''));
    if ($hari === '' || $jam === '' || $kelas === '') {
        json_response(['status' => true, 'conflict' => false, 'message' => '']);
    }
    $guruName = ($user['role'] === 'admin' && $guruParam !== '') ? $guruParam : $user['nama'];
    $res = find_jadwal_conflict($pdo, $hari, $jam, $kelas, $guruName);
    json_response(['status' => true, 'conflict' => $res['conflict'], 'message' => $res['message']]);
}

if ($method === 'POST' && $route === '/jadwal') {
    $user = require_auth($pdo, ['admin', 'guru']);
    $b = get_json_body();
    if (empty($b['hari']) || empty($b['jam']) || empty($b['kelas']) || empty($b['mapel'])) {
        json_response(['status' => false, 'message' => 'Hari, jam, kelas, dan mapel wajib diisi.'], 400);
    }
    $guruName = ($user['role'] === 'admin' && !empty($b['guru'])) ? trim((string)$b['guru']) : $user['nama'];
    $conflict = find_jadwal_conflict($pdo, $b['hari'], $b['jam'], $b['kelas'], $guruName);
    if ($conflict['conflict']) {
        json_response(['status' => false, 'message' => $conflict['message']], 409);
    }
    $pdo->prepare('INSERT INTO jadwal_pelajaran (hari, jam, kelas, mapel, guru, ruang) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([trim($b['hari']), trim($b['jam']), trim($b['kelas']), trim($b['mapel']), $guruName, trim((string)($b['ruang'] ?? 'Kelas Utama'))]);
    json_response(['status' => true, 'message' => 'Jadwal mengajar berhasil ditambahkan!']);
}

if ($method === 'DELETE' && preg_match('#^/jadwal/(\d+)$#', $route, $m)) {
    $user = require_auth($pdo, ['admin', 'guru']);
    if ($user['role'] === 'admin') {
        $pdo->prepare('DELETE FROM jadwal_pelajaran WHERE id = ?')->execute([(int)$m[1]]);
    } else {
        $pdo->prepare('DELETE FROM jadwal_pelajaran WHERE id = ? AND LOWER(guru) = LOWER(?)')->execute([(int)$m[1], $user['nama']]);
    }
    json_response(['status' => true, 'message' => 'Jadwal berhasil dihapus.']);
}

// 13. KALENDER
if ($method === 'POST' && $route === '/kalender') {
    require_auth($pdo, ['admin', 'guru']);
    $b = get_json_body();
    if (empty($b['tanggal'])) {
        json_response(['status' => false, 'message' => 'Tanggal wajib diisi.'], 400);
    }
    $tgl = substr((string)$b['tanggal'], 0, 10);
    $pdo->prepare(
        'INSERT INTO kalender_pendidikan (tanggal, mode_kbm, status_efektif, jam_mulai, jam_selesai, keterangan)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE mode_kbm=VALUES(mode_kbm), status_efektif=VALUES(status_efektif), jam_mulai=VALUES(jam_mulai), jam_selesai=VALUES(jam_selesai), keterangan=VALUES(keterangan)'
    )->execute([$tgl, $b['modeKbm'] ?? 'Luring', $b['statusEfektif'] ?? 'Efektif', $b['jamMulai'] ?? '06:30', $b['jamSelesai'] ?? '16:00', $b['keterangan'] ?? '-']);
    json_response(['status' => true, 'message' => "Kalender Pendidikan {$tgl} berhasil disimpan!"]);
}

if ($method === 'DELETE' && preg_match('#^/kalender/(\d+)$#', $route, $m)) {
    require_auth($pdo, ['admin', 'guru']);
    $pdo->prepare('DELETE FROM kalender_pendidikan WHERE id = ?')->execute([(int)$m[1]]);
    json_response(['status' => true, 'message' => 'Entri Kalender Pendidikan dihapus.']);
}

// 14. USERS, HAK AKSES, PENGATURAN
if ($method === 'POST' && $route === '/users') {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    if (empty($b['username']) || empty($b['password']) || empty($b['role']) || empty($b['nama']) || empty($b['nisNip'])) {
        json_response(['status' => false, 'message' => 'Semua field pengguna wajib diisi.'], 400);
    }
    try {
        $pdo->prepare('INSERT INTO users (username, password_hash, role, nama, nis_nip, kelas, jk) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([strtolower(trim($b['username'])), hash_password_php((string)$b['password']), strtolower($b['role']), trim($b['nama']), trim($b['nisNip']), $b['kelas'] ?? 'ALL', $b['jk'] ?? 'L']);
        json_response(['status' => true, 'message' => 'Akun pengguna baru berhasil ditambahkan!']);
    } catch (Throwable $e) {
        json_response(['status' => false, 'message' => 'Username sudah digunakan.'], 400);
    }
}

if ($method === 'PUT' && preg_match('#^/users/(\d+)$#', $route, $m)) {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    $id = (int)$m[1];
    $st = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$id]);
    $ex = $st->fetch();
    if (!$ex) json_response(['status' => false, 'message' => 'Pengguna tidak ditemukan.'], 404);
    $newHash = !empty($b['password']) ? hash_password_php((string)$b['password']) : $ex['password_hash'];
    $pdo->prepare('UPDATE users SET role=?, nama=?, nis_nip=?, kelas=?, jk=?, password_hash=? WHERE id=?')
        ->execute([$b['role'] ?? $ex['role'], $b['nama'] ?? $ex['nama'], $b['nisNip'] ?? $ex['nis_nip'], $b['kelas'] ?? $ex['kelas'], $b['jk'] ?? $ex['jk'], $newHash, $id]);
    json_response(['status' => true, 'message' => 'Data akun pengguna diperbarui!']);
}

if ($method === 'DELETE' && preg_match('#^/users/(\d+)$#', $route, $m)) {
    require_auth($pdo, ['admin']);
    $id = (int)$m[1];
    $st = $pdo->prepare('SELECT username FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    if ($u && $u['username'] === 'admin') {
        json_response(['status' => false, 'message' => 'Akun Administrator utama tidak dapat dihapus.'], 400);
    }
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    json_response(['status' => true, 'message' => 'Akun pengguna dihapus.']);
}

if ($method === 'PUT' && $route === '/hak-akses') {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    $cfg = $b['config'] ?? [];
    $stmt = $pdo->prepare('INSERT INTO hak_akses_role (id, nama, admin, guru, karyawan, siswa) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nama=VALUES(nama), admin=VALUES(admin), guru=VALUES(guru), karyawan=VALUES(karyawan), siswa=VALUES(siswa)');
    foreach ($cfg as $item) {
        $stmt->execute([$item['id'], $item['nama'], 1, !empty($item['guru']) ? 1 : 0, !empty($item['karyawan']) ? 1 : 0, !empty($item['siswa']) ? 1 : 0]);
    }
    json_response(['status' => true, 'message' => 'Hak akses role berhasil disimpan!']);
}

if ($method === 'PUT' && $route === '/pengaturan') {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    if (empty($b['namaSekolah']) || empty($b['alamatSekolah'])) {
        json_response(['status' => false, 'message' => 'Nama Sekolah dan Alamat Sekolah wajib diisi.'], 400);
    }
    $pdo->prepare('UPDATE pengaturan SET nama_sekolah=?, alamat_sekolah=?, tahun_ajaran=?, nama_walikelas=?, kelas_ampu=?, lat_gps=?, lng_gps=?, radius_meter=?, footer_app=?, logo_sekolah=? WHERE id=1')
        ->execute([
            trim($b['namaSekolah']), trim($b['alamatSekolah']), trim((string)($b['tahunAjaran'] ?? '2025/2026')),
            trim((string)($b['namaWalikelas'] ?? '-')), trim((string)($b['kelasAmpu'] ?? '-')),
            (float)($b['latGps'] ?? -7.001759), (float)($b['lngGps'] ?? 107.623047),
            (int)($b['radiusMeter'] ?? 100), trim((string)($b['footerApp'] ?? '')), trim((string)($b['logoSekolah'] ?? '')),
        ]);
    json_response(['status' => true, 'message' => 'Pengaturan Sekolah (Logo, Alamat, Nama Sekolah, GPS) berhasil diperbarui!']);
}

// 15. ADMIN MYSQL / DEBUG / EXPORT / CSV
if ($method === 'GET' && $route === '/supabase-schema') {
    require_auth($pdo, ['admin']);
    json_response(['status' => true, 'schema' => '-- Mode PHP Hosting (MySQL aktif langsung)', 'configured' => false]);
}

if ($method === 'GET' && $route === '/admin/mysql-info') {
    require_auth($pdo, ['admin']);
    json_response([
        'status' => true,
        'mysqlConfigured' => true,
        'schemaSql' => get_mysql_schema_sql(),
        'phpTemplate' => "<?php\n\$host = getenv('MYSQL_HOST') ?: 'localhost';\n\$username = getenv('MYSQL_USER') ?: '';\n\$password = getenv('MYSQL_PASSWORD') ?: '';\n\$database = getenv('MYSQL_DATABASE') ?: '';\n\$koneksi = mysqli_connect(\$host, \$username, \$password, \$database);\n?>",
    ]);
}

if ($method === 'GET' && ($route === '/admin/mysql-test' || $route === '/admin/db-debug')) {
    require_auth($pdo, ['admin']);
    $t0 = microtime(true);
    $ver = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
    $tables = $pdo->query('SHOW TABLES')->fetchAll();
    $latency = (int)round((microtime(true) - $t0) * 1000);
    $host = trim(env_val('MYSQL_HOST', 'localhost'));
    $port = (int)env_val('MYSQL_PORT', '3306');
    $dbName = trim(env_val('MYSQL_DATABASE', ''));
    $dbUser = trim(env_val('MYSQL_USER', '-'));

    $mysqlDiag = [
        'ok' => true, 'configured' => true, 'host' => $host, 'port' => $port,
        'database' => $dbName, 'user' => $dbUser,
        'hostType' => ($host === 'localhost' || $host === '127.0.0.1') ? 'localhost' : 'remote',
        'sslActive' => false, 'serverVersion' => $ver, 'tableCount' => count($tables),
        'latencyMs' => $latency, 'errorCode' => 'OK',
        'message' => "Mode Hosting PHP MySQL aktif & terhubung ke {$host}:{$port}/{$dbName} ({$ver}, {$latency} ms, " . count($tables) . ' tabel).',
    ];

    if ($route === '/admin/mysql-test') {
        json_response(array_merge(['status' => true], $mysqlDiag));
    }

    $cnt = function($t) use ($pdo) {
        return (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
    };
    $counts = [
        'siswa' => $cnt('siswa'), 'users' => $cnt('users'), 'jadwal_pelajaran' => $cnt('jadwal_pelajaran'),
        'jurnal_harian' => $cnt('jurnal_harian'), 'kehadiran_siswa' => $cnt('kehadiran_siswa'),
        'kehadiran_pegawai' => $cnt('kehadiran_pegawai'), 'pengumpulan_tugas' => $cnt('pengumpulan_tugas'),
        'pembinaan_siswa' => $cnt('pembinaan_siswa'), 'kalender_pendidikan' => $cnt('kalender_pendidikan'),
        'agenda_akademik' => $cnt('agenda_akademik'), 'data_jurusan' => $cnt('data_jurusan'),
        'master_mapel' => $cnt('master_mapel'),
    ];
    json_response([
        'status' => true,
        'checkedAt' => date('Y-m-d H:i:s') . ' WIB (PHP MySQL Mode)',
        'envFileExists' => is_file(dirname(__DIR__, 1) . '/.env') || is_file(dirname(__DIR__, 2) . '/.env'),
        'sqlite' => ['ok' => true, 'file' => 'MySQL Aktif (Hosting PHP)', 'counts' => $counts],
        'mysql' => $mysqlDiag,
        'supabase' => ['configured' => false],
    ]);
}

if ($method === 'POST' && $route === '/admin/mysql-sync') {
    require_auth($pdo, ['admin']);
    json_response(['status' => true, 'message' => 'Aplikasi sudah berjalan langsung di atas database MySQL hosting.', 'syncedCounts' => []]);
}

if ($method === 'GET' && $route === '/admin/mysql-export.sql') {
    require_auth($pdo, ['admin']);
    header('Content-Type: application/sql; charset=utf-8');
    header('Content-Disposition: attachment; filename="db_absensi_export.sql"');
    echo "-- EXPORT SKEMA MYSQL\n" . get_mysql_schema_sql() . "\n";
    exit;
}

if ($method === 'GET' && $route === '/admin/php-api-download') {
    require_auth($pdo, ['admin']);
    header('Content-Type: application/x-httpd-php; charset=utf-8');
    header('Content-Disposition: attachment; filename="api.php"');
    readfile(__FILE__);
    exit;
}

if ($method === 'POST' && $route === '/admin/import-siswa-csv') {
    require_auth($pdo, ['admin']);
    $b = get_json_body();
    $csv = (string)($b['csvContent'] ?? '');
    if (trim($csv) === '') {
        $defaultPath = is_file(__DIR__ . '/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv')
            ? __DIR__ . '/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv'
            : dirname(__DIR__, 1) . '/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv';
        if (!is_file($defaultPath)) {
            json_response(['status' => false, 'message' => 'File CSV default tidak ditemukan.'], 404);
        }
        $csv = (string)file_get_contents($defaultPath);
    }
    $res = import_csv_students($pdo, $csv);
    json_response([
        'status' => true,
        'importedCount' => $res['importedCount'],
        'skippedCount' => $res['skippedCount'],
        'message' => "{$res['importedCount']} data siswa berhasil diimpor dan diperbarui!",
    ]);
}

// 16. TUGAS DIGITAL
if ($method === 'POST' && $route === '/tugas/submit') {
    $user = require_auth($pdo, ['siswa']);
    $b = get_json_body();
    if (empty($b['mapel']) || empty($b['tanggalTugas']) || empty($b['fileName']) || empty($b['fileBase64'])) {
        json_response(['status' => false, 'message' => 'Mata pelajaran, tanggal tugas, dan berkas wajib diisi.'], 400);
    }
    $rawB64 = preg_replace('/^data:[^;]+;base64,/', '', (string)$b['fileBase64']);
    $bin = base64_decode((string)$rawB64, true);
    if ($bin === false || strlen($bin) === 0 || strlen($bin) > 10 * 1024 * 1024) {
        json_response(['status' => false, 'message' => 'Ukuran atau isi berkas tidak valid (Maks 10MB).'], 400);
    }
    $extMap = [
        'application/pdf' => 'pdf', 'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
    ];
    $mime = (string)($b['mimeType'] ?? '');
    if (!isset($extMap[$mime])) {
        json_response(['status' => false, 'message' => 'Tipe file ditolak. Hanya PDF, DOC, DOCX, JPG, PNG, WEBP.'], 400);
    }
    $uploadDir = is_dir(__DIR__ . '/api') ? (__DIR__ . '/api/uploads') : (__DIR__ . '/uploads');
    if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
    $idPeng = 'TGS-' . strtoupper(bin2hex(random_bytes(3)));
    $safeName = substr(preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo((string)$b['fileName'], PATHINFO_FILENAME)) ?: 'tugas', 0, 50);
    $storedFile = "{$idPeng}_{$user['nisNip']}_{$safeName}.{$extMap[$mime]}";
    file_put_contents($uploadDir . '/' . $storedFile, $bin);

    $waktu = date('Y-m-d H:i:s');
    $pdo->prepare(
        "INSERT INTO pengumpulan_tugas (id_pengumpulan, waktu_pengiriman, nis, nama_siswa, kelas, tanggal_tugas, mapel, keterangan, nama_file, file_path, status, nilai_tugas, catatan_nilai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Terkirim', '', '')"
    )->execute([$idPeng, $waktu, $user['nisNip'], $user['nama'], $user['kelas'], $b['tanggalTugas'], $b['mapel'], $b['keterangan'] ?? '-', $b['fileName'], $storedFile]);

    json_response([
        'status' => true,
        'message' => "Tugas berhasil diunggah dengan ID {$idPeng}.",
        'receipt' => [
            'idPengumpulan' => $idPeng, 'waktuPengiriman' => $waktu, 'nis' => $user['nisNip'],
            'namaSiswa' => $user['nama'], 'kelas' => $user['kelas'], 'tanggalTugas' => $b['tanggalTugas'],
            'mapel' => $b['mapel'], 'keterangan' => $b['keterangan'] ?? '-', 'namaFile' => $b['fileName'],
            'status' => 'Terkirim', 'nilaiTugas' => '', 'catatanNilai' => '',
        ],
    ]);
}

if ($method === 'GET' && $route === '/tugas/cek') {
    $user = require_auth($pdo);
    $nis = trim((string)($_GET['nis'] ?? ''));
    $id = strtoupper(trim((string)($_GET['id'] ?? '')));
    if ($nis === '' || $id === '') {
        json_response(['status' => false, 'message' => 'Masukkan NIS dan ID Pengumpulan.'], 400);
    }
    if ($user['role'] === 'siswa' && strcasecmp($nis, $user['nisNip']) !== 0) {
        json_response(['status' => false, 'message' => 'Anda hanya dapat memeriksa tugas milik Anda sendiri.'], 403);
    }
    $st = $pdo->prepare('SELECT * FROM pengumpulan_tugas WHERE UPPER(id_pengumpulan) = ? AND LOWER(nis) = LOWER(?) LIMIT 1');
    $st->execute([$id, $nis]);
    $row = $st->fetch();
    if (!$row) json_response(['status' => false, 'message' => 'Data pengumpulan tugas tidak ditemukan.'], 404);
    json_response([
        'status' => true,
        'receipt' => [
            'idPengumpulan' => (string)$row['id_pengumpulan'], 'waktuPengiriman' => (string)$row['waktu_pengiriman'],
            'nis' => (string)$row['nis'], 'namaSiswa' => (string)$row['nama_siswa'], 'kelas' => (string)$row['kelas'],
            'tanggalTugas' => (string)$row['tanggal_tugas'], 'mapel' => (string)$row['mapel'],
            'keterangan' => (string)$row['keterangan'], 'namaFile' => (string)$row['nama_file'],
            'status' => (string)$row['status'], 'nilaiTugas' => (string)($row['nilai_tugas'] ?? ''),
            'catatanNilai' => (string)($row['catatan_nilai'] ?? ''),
        ],
    ]);
}

if ($method === 'PUT' && preg_match('#^/tugas/([^/]+)/nilai$#', $route, $m)) {
    require_auth($pdo, ['admin']);
    $id = strtoupper(trim((string)$m[1]));
    $b = get_json_body();
    $nilai = trim((string)($b['nilaiTugas'] ?? ''));
    if ($nilai === '' || !is_numeric($nilai) || (float)$nilai < 0 || (float)$nilai > 100) {
        json_response(['status' => false, 'message' => 'Nilai tugas harus berupa angka 0 - 100.'], 400);
    }
    $st = $pdo->prepare("UPDATE pengumpulan_tugas SET nilai_tugas = ?, catatan_nilai = ?, status = 'Dinilai' WHERE id_pengumpulan = ?");
    $st->execute([(string)(float)$nilai, trim((string)($b['catatanNilai'] ?? '')), $id]);
    if ($st->rowCount() === 0) json_response(['status' => false, 'message' => 'ID Pengumpulan tidak ditemukan.'], 404);
    json_response(['status' => true, 'message' => "Nilai tugas {$id} berhasil disimpan ({$nilai})."]);
}

if ($method === 'GET' && preg_match('#^/tugas/([^/]+)/download$#', $route, $m)) {
    $user = require_auth($pdo);
    $id = strtoupper(trim((string)$m[1]));
    $st = $pdo->prepare('SELECT * FROM pengumpulan_tugas WHERE id_pengumpulan = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) json_response(['status' => false, 'message' => 'Berkas tidak ditemukan.'], 404);
    if ($user['role'] !== 'admin' && strcasecmp((string)$row['nis'], $user['nisNip']) !== 0) {
        json_response(['status' => false, 'message' => 'Akses berkas ditolak.'], 403);
    }
    $safe = basename((string)$row['file_path']);
    $uploadDir = is_dir(__DIR__ . '/api') ? (__DIR__ . '/api/uploads') : (__DIR__ . '/uploads');
    $full = $uploadDir . '/' . $safe;
    if (!is_file($full)) json_response(['status' => false, 'message' => 'File fisik tidak ditemukan.'], 404);
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename((string)$row['nama_file']) . '"');
    header('Content-Length: ' . filesize($full));
    readfile($full);
    exit;
}

json_response(['status' => false, 'message' => 'Endpoint API tidak ditemukan.'], 404);
