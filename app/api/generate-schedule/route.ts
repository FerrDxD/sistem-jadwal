import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════
//  KONSTANTA & KONFIGURASI
// ═══════════════════════════════════════════════════════════════

/** Nama BPH — pencarian partial, case-insensitive */
const BPH_NAMES = [
  'cecillia', 'adam', 'fadhli', 'ferdi', 'anggun', 'inez',
  'lulu', 'erlangga', 'nayra', 'febriyanti', 'desti elisa',
  'juansyah', 'luqman',
];

const SESSION_SIZE  = 5;  // petugas per sesi
const MAX_DUTY_BPH  = 3;  // BPH: maks tugas per minggu (tidak boleh semua hari)
const MAX_DUTY_REG  = 1;  // Anggota biasa: maks 1 tugas per minggu

/**
 * Pola campuran OSIS–MPK untuk 5 slot.
 * Diusahakan: OSIS, MPK, OSIS, MPK, OSIS.
 * Jika salah satu kehabisan, tryPick akan fallback ke siapa saja.
 */
const MIX_PATTERN: Array<'OSIS' | 'MPK' | null> = [
  'OSIS', 'MPK', 'OSIS', 'MPK', 'OSIS',
];

// ═══════════════════════════════════════════════════════════════
//  TIPE DATA
// ═══════════════════════════════════════════════════════════════

interface MemberState {
  id: string;
  full_name: string;
  class_grade: string;        // e.g. 'X', 'X IPA 1', 'XI IPS 2'
  organization_role: string;  // e.g. 'OSIS Sekretaris', 'MPK Ketua'
  isBPH: boolean;
  weeklyCount: number;        // tugas dalam periode ini
  totalCount: number;         // akumulasi total (dari DB + periode ini)
  originalCount: number;      // nilai awal dari DB (untuk diff update)
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: IDENTIFIKASI ANGGOTA
// ═══════════════════════════════════════════════════════════════

const checkBPH = (name: string): boolean =>
  BPH_NAMES.some(b => name.toLowerCase().includes(b));

const isOSIS = (m: MemberState): boolean =>
  m.organization_role.toUpperCase().includes('OSIS');

const isMPK = (m: MemberState): boolean =>
  m.organization_role.toUpperCase().includes('MPK');

/**
 * Pencocokan kelas yang robust:
 * 'X', 'X IPA 1', 'X-A', 'X1' → isGrade(grade, 'X') = true
 * 'XI', 'XI IPS 2', 'XI-B'    → isGrade(grade, 'XI') = true
 * 'XII' TIDAK cocok dengan 'XI'
 */
const isGrade = (grade: string, roman: 'X' | 'XI'): boolean => {
  const g = grade.toUpperCase().trim();
  if (roman === 'X')  return /^X(?!I)/i.test(g);
  if (roman === 'XI') return /^XI(?!I)/i.test(g);
  return false;
};

const formatMember = (m: MemberState): string =>
  `${m.full_name} (${m.class_grade} – ${m.organization_role})`;

// ═══════════════════════════════════════════════════════════════
//  HELPER: VALIDASI BATAS MINGGUAN
// ═══════════════════════════════════════════════════════════════

/**
 * Apakah anggota masih di bawah batas tugas mingguan?
 *
 * BPH     → maks MIN(MAX_DUTY_BPH, totalDays-1)
 *            → tidak boleh bekerja semua hari (minimal 1 hari off)
 * Regular → maks MAX_DUTY_REG (default: 1)
 *
 * @param m         state anggota
 * @param totalDays total hari dalam periode jadwal
 */
const underWeeklyLimit = (m: MemberState, totalDays: number): boolean => {
  if (m.isBPH) {
    // Tidak boleh full-week: batas efektif = min(3, days-1)
    const cap = Math.min(MAX_DUTY_BPH, totalDays - 1);
    return m.weeklyCount < cap;
  }
  return m.weeklyCount < MAX_DUTY_REG;
};

// ═══════════════════════════════════════════════════════════════
//  CORE: PEMILIH PETUGAS PER SESI
// ═══════════════════════════════════════════════════════════════

/**
 * Memilih hingga `count` anggota dari `pool` untuk satu sesi.
 *
 * Strategi fallback bertingkat:
 *   Layer 1 (IDEAL)   → belum bertugas hari ini + di bawah batas mingguan
 *   Layer 2 (BPH+)    → belum bertugas hari ini, batas mingguan terlampaui
 *                        (BPH yang sudah > batas tapi darurat)
 *   Layer 3 (2× hari) → sudah bertugas hari ini, tapi masih di bawah batas minggu
 *                        (anggota biasa: aktif karena stok habis)
 *   Layer 4 (DARURAT)  → siapa saja yang tersedia (stok benar-benar habis)
 *
 * Setiap layer diurutkan berdasarkan keadilan:
 *   weeklyCount ASC → totalCount ASC (yang paling sedikit bertugas diprioritaskan)
 *
 * Pola campuran OSIS–MPK diterapkan per slot.
 * Jika tidak ada kandidat dengan role target, fallback ke siapa saja dalam layer.
 *
 * @param pool          daftar kandidat (sudah difilter kelas jika perlu)
 * @param assignedToday set ID anggota yang sudah bertugas hari ini (lintas program)
 * @param totalDays     total hari dalam periode (untuk validasi full-week BPH)
 * @param count         jumlah petugas yang dibutuhkan (default: SESSION_SIZE)
 */
function pickForSession(
  pool: MemberState[],
  assignedToday: Set<string>,
  totalDays: number,
  count: number = SESSION_SIZE,
): MemberState[] {
  const selected: MemberState[] = [];
  const usedInSession = new Set<string>(); // mencegah duplikasi dalam satu sesi

  /** Komparator keadilan */
  const fairSort = (a: MemberState, b: MemberState): number => {
    if (a.weeklyCount !== b.weeklyCount) return a.weeklyCount - b.weeklyCount;
    return a.totalCount - b.totalCount;
  };

  /**
   * Coba ambil 1 kandidat dari daftar candidates yang cocok dengan roleFilter.
   * roleFilter null = siapa saja.
   * Mengembalikan kandidat terpilih atau null jika tidak ada.
   */
  const tryPick = (
    candidates: MemberState[],
    roleFilter: 'OSIS' | 'MPK' | null,
  ): MemberState | null => {
    const filtered = candidates
      .filter(m => !usedInSession.has(m.id))
      .filter(m =>
        roleFilter === 'OSIS' ? isOSIS(m) :
        roleFilter === 'MPK'  ? isMPK(m)  : true,
      )
      .sort(fairSort);

    if (!filtered.length) return null;
    usedInSession.add(filtered[0].id);
    return filtered[0];
  };

  for (let slot = 0; slot < count; slot++) {
    const roleTarget = MIX_PATTERN[slot] ?? null;

    // Susun layer prioritas (dihitung ulang setiap slot karena usedInSession berubah)
    const notToday   = pool.filter(m => !assignedToday.has(m.id));
    const today      = pool.filter(m =>  assignedToday.has(m.id));

    const layer1 = notToday.filter(m =>  underWeeklyLimit(m, totalDays));
    const layer2 = notToday.filter(m => !underWeeklyLimit(m, totalDays));
    const layer3 = today.filter(m    =>  underWeeklyLimit(m, totalDays));
    const layer4 = pool; // darurat mutlak

    let picked: MemberState | null = null;

    for (const layer of [layer1, layer2, layer3, layer4]) {
      // Coba dengan role target dulu
      picked = tryPick(layer, roleTarget);
      if (picked) break;
      // Fallback: abaikan role, ambil siapa saja dari layer ini
      picked = tryPick(layer, null);
      if (picked) break;
    }

    if (picked) selected.push(picked);
  }

  return selected;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, days = 5 } = body;

    // ── 1. Ambil data anggota aktif dari Supabase ──────────────
    const { data: rawMembers, error: membersError } = await supabase
      .from('members')
      .select('*')
      .eq('is_active', true);

    if (membersError) throw membersError;
    if (!rawMembers?.length) throw new Error('Tidak ada data anggota aktif.');

    // ── 2. Inisialisasi state lokal ────────────────────────────
    // State ini yang dimodifikasi selama generasi; DB di-update setelah selesai.
    const memberState: MemberState[] = rawMembers.map(m => ({
      id:               m.id,
      full_name:        m.full_name       ?? '',
      class_grade:      m.class_grade     ?? '',
      organization_role: m.organization_role ?? '',
      isBPH:            checkBPH(m.full_name ?? ''),
      weeklyCount:      0,
      totalCount:       m.duty_count ?? 0,
      originalCount:    m.duty_count ?? 0,
    }));

    /**
     * Commit hasil pemilihan:
     * - Tambahkan ID ke assignedToday
     * - Naikkan weeklyCount dan totalCount di state
     */
    const commit = (
      picked: MemberState[],
      assignedToday: Set<string>,
    ): void => {
      for (const p of picked) {
        const s = memberState.find(m => m.id === p.id);
        if (!s) continue;
        assignedToday.add(s.id);
        s.weeklyCount += 1;
        s.totalCount  += 1;
      }
    };

    // ── 3. Iterasi per hari ────────────────────────────────────
    const generatedSchedule: {
      tanggal: string;
      SASAMU: { nama_sesi: string; petugas: string[]; jumlah: number }[];
      JAMPARIKU: { nama_sesi: string; kelas_target: string; petugas: string[]; jumlah: number }[];
    }[] = [];

    for (let day = 0; day < days; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().split('T')[0];

      // Set ini di-reset setiap hari dan dipakai bersama oleh SASAMU & JAMPARIKU.
      // Anggota yang sudah masuk di sini tidak akan diprioritaskan untuk program lain
      // di hari yang sama (kecuali darurat / stok habis).
      const assignedToday = new Set<string>();

      // ┌─ SASAMU ─────────────────────────────────────────────┐
      // │ Fleksibel: kelas X dan XI, campuran OSIS+MPK         │
      // └──────────────────────────────────────────────────────┘
      const poolSASAMU = memberState.filter(
        m => isGrade(m.class_grade, 'X') || isGrade(m.class_grade, 'XI'),
      );

      const sasamuSesi: { nama_sesi: string; petugas: string[]; jumlah: number }[] = [];

      for (const session of ['Pagi', 'Siang'] as const) {
        const picked = pickForSession(poolSASAMU, assignedToday, days);
        commit(picked, assignedToday);
        sasamuSesi.push({
          nama_sesi: session,
          petugas:   picked.map(formatMember),
          jumlah:    picked.length,
        });
      }

      // ┌─ JAMPARIKU ──────────────────────────────────────────┐
      // │ Pagi  → kelas XI (masuk pagi)                        │
      // │ Siang → kelas X  (masuk siang)                       │
      // │ Campuran OSIS+MPK sesuai kelas masing-masing         │
      // └──────────────────────────────────────────────────────┘
      const jampConfig: { session: string; grade: 'X' | 'XI' }[] = [
        { session: 'Pagi',  grade: 'XI' },
        { session: 'Siang', grade: 'X'  },
      ];

      const jampSesi: { nama_sesi: string; kelas_target: string; petugas: string[]; jumlah: number }[] = [];

      for (const { session, grade } of jampConfig) {
        // Pool khusus kelas target.
        // Jika anggota sudah di assignedToday (dari SASAMU), mereka masuk Layer 3/4
        // (tidak diprioritaskan, tapi bisa dipakai jika stok habis).
        const poolJAMP = memberState.filter(m => isGrade(m.class_grade, grade));
        const picked = pickForSession(poolJAMP, assignedToday, days);
        commit(picked, assignedToday);
        jampSesi.push({
          nama_sesi:    session,
          kelas_target: grade,
          petugas:      picked.map(formatMember),
          jumlah:       picked.length,
        });
      }

      generatedSchedule.push({
        tanggal:   dateStr,
        SASAMU:    sasamuSesi,
        JAMPARIKU: jampSesi,
      });
    }

    // ── 4. Auto-save ke Supabase (hanya anggota yang berubah) ──
    const updates = memberState.filter(m => m.totalCount > m.originalCount);
    await Promise.all(
      updates.map(m =>
        supabase
          .from('members')
          .update({ duty_count: m.totalCount })
          .eq('id', m.id),
      ),
    );

    // ── 5. Buat ringkasan distribusi ───────────────────────────
    const ringkasan = {
      periode: {
        mulai: startDate,
        total_hari: days,
      },
      total_sesi: days * 4, // 2 program × 2 sesi per hari
      distribusi: memberState
        .filter(m => m.weeklyCount > 0)
        .map(m => ({
          nama:         m.full_name,
          status:       m.isBPH ? 'BPH' : 'Anggota',
          tugas_minggu: m.weeklyCount,
          total_tugas:  m.totalCount,
        }))
        .sort((a, b) => b.tugas_minggu - a.tugas_minggu),
      peringatan: memberState
        .filter(m => m.isBPH && m.weeklyCount >= Math.min(MAX_DUTY_BPH, days - 1))
        .map(m => `${m.full_name} mencapai batas maksimum BPH (${m.weeklyCount}x)`),
    };

    return NextResponse.json({
      status:  'success',
      message: `Jadwal SASAMU & JAMPARIKU ${days} hari berhasil dibuat.`,
      ringkasan,
      schedule: generatedSchedule,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}