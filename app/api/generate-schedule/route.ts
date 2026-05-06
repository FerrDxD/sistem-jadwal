import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, days = 5 } = body;

    const { data: programs, error: programsError } = await supabase.from('programs').select('*');
    if (programsError) throw programsError;

    const { data: members, error: membersError } = await supabase.from('members').select('*').eq('is_active', true);
    if (membersError) throw membersError;

    if (!members || members.length === 0) throw new Error("Tidak ada data anggota.");

    let generatedSchedule = [];
    let availableMembers = [...members].map(m => ({ ...m, current_duty: m.duty_count || 0 }));

    const SESSIONS = ['Pagi', 'Siang'];
    const BPH_NAMES = ['cecillia', 'adam', 'fadhli', 'ferdi', 'anggun', 'inez', 'lulu', 'erlangga', 'nayra', 'desti', 'febri tanjung', 'elisa', 'juansyah', 'luqman'];
    
    const isBPH = (name: string) => name && BPH_NAMES.some(bph => name.toLowerCase().includes(bph.toLowerCase()));
    const isClassXI = (grade: string) => grade && (grade.startsWith('XI.') || grade.startsWith('XI ') || grade === 'XI');
    const isClassX = (grade: string) => grade && !isClassXI(grade) && (grade.startsWith('X.') || grade.startsWith('X ') || grade === 'X');

    // Buku Catatan Global: Berapa kali orang ini tugas MINGGU INI?
    let weeklyCount = new Map();

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set(); // Harga Mati: 1 Hari = 1 Tugas

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          let selectedForShift: any[] = [];
          let bphInShift = 0;
          let maxBphPerShift = program.name === 'SASAMU' ? 1 : 2;

          // Fungsi Pemanggilan Anggota
          const pickMember = (reqClass: string, targetRole: string | null, forceClass: boolean) => {
            let pool = availableMembers.filter(m => !assignedToday.has(m.id) && m.class_grade);

            // Prioritaskan yang belum pernah tugas minggu ini sama sekali
            pool.sort((a, b) => {
              let aWeek = weeklyCount.get(a.id) || 0;
              let bWeek = weeklyCount.get(b.id) || 0;
              if (aWeek !== bWeek) return aWeek - bWeek;
              return (a.current_duty || 0) - (b.current_duty || 0);
            });

            const checkClass = (m: any) => {
              if (reqClass === 'XI') return isClassXI(m.class_grade);
              if (reqClass === 'X') return isClassX(m.class_grade);
              return false;
            };

            // PERLINDUNGAN HAK ASASI ANGGOTA (Anti-Kerja Rodi)
            const checkLimits = (m: any, isEmergency: boolean) => {
              let weekTotal = weeklyCount.get(m.id) || 0;
              let bph = isBPH(m.full_name);
              
              if (!isEmergency) {
                 return weekTotal < (bph ? 2 : 1); // Ideal: BPH max 2, Biasa max 1
              } else {
                 return weekTotal < (bph ? 3 : 2); // Darurat: BPH max 3, Biasa max 2. TITIK. TIDAK BOLEH LEBIH DARI INI.
              }
            };

            let candidate = null;

            // LAPIS 1: Cari sesuai Kelas, sesuai Organisasi (OSIS/MPK), dan batas Ideal
            if (targetRole) {
              candidate = pool.find(m => checkClass(m) && m.organization_role === targetRole && checkLimits(m, false) && !(isBPH(m.full_name) && bphInShift >= maxBphPerShift));
            }

            // LAPIS 2: Kalau role-nya gak ketemu, abaikan role-nya, tapi tetap perhatikan kelas dan batas Ideal
            if (!candidate) {
              candidate = pool.find(m => checkClass(m) && checkLimits(m, false) && !(isBPH(m.full_name) && bphInShift >= maxBphPerShift));
            }

            // LAPIS 3: Kalau orangnya masih kurang, naikkan batasnya jadi Mode Darurat
            if (!candidate) {
              candidate = pool.find(m => checkClass(m) && checkLimits(m, true) && !(isBPH(m.full_name) && bphInShift >= maxBphPerShift));
            }

            // LAPIS 4: BPH numpuk gak apa-apa, asal batas tugas darurat gak jebol
            if (!candidate) {
              candidate = pool.find(m => checkClass(m) && checkLimits(m, true));
            }

            // LAPIS 5 (KHUSUS SASAMU): Boleh minjam kelas lain, pakai batas normal
            if (!candidate && !forceClass) {
              candidate = pool.find(m => checkLimits(m, false));
              // Lapis 6: Pinjam kelas lain, pakai batas darurat
              if (!candidate) candidate = pool.find(m => checkLimits(m, true));
            }

            if (candidate) {
              assignedToday.add(candidate.id);
              weeklyCount.set(candidate.id, (weeklyCount.get(candidate.id) || 0) + 1);
              if (isBPH(candidate.full_name)) bphInShift++;
              
              let idx = availableMembers.findIndex(am => am.id === candidate.id);
              if (idx !== -1) availableMembers[idx].current_duty += 1;
              
              selectedForShift.push(candidate);
            }
          };

          // EKSEKUSI PEMANGGILAN (WAJIB SELANG-SELING OSIS DAN MPK)
          if (program.name === 'SASAMU') {
            pickMember('XI', 'OSIS', false); 
            pickMember('XI', 'MPK', false);  // Panggil MPK!
            pickMember('XI', 'OSIS', false);
            pickMember('X', 'MPK', false);   // Panggil MPK!
            pickMember('X', 'OSIS', false);
          } else {
            let targetClass = session === 'Pagi' ? 'XI' : 'X';
            pickMember(targetClass, 'OSIS', true);
            pickMember(targetClass, 'MPK', true);  // Panggil MPK!
            pickMember(targetClass, 'OSIS', true);
            pickMember(targetClass, 'MPK', true);  // Panggil MPK!
            pickMember(targetClass, 'OSIS', true);
          }

          // Kalau masih ada sisa tempat kosong (karena kekurangan orang dengan role di atas), isi pakai siapa saja yang masih memenuhi batas aman
          while (selectedForShift.length < program.members_required_per_shift) {
            let currentLen = selectedForShift.length;
            let tClass = session === 'Pagi' ? 'XI' : 'X';
            pickMember(tClass, null, program.name !== 'SASAMU');
            if (selectedForShift.length === currentLen) break; // Benar-benar kehabisan orang sedunia
          }

          sessionData.tugas.push({
            program: program.name,
            // Aku munculin lagi keterangan organisasinya biar kamu bisa lihat MPK nongkrong di sana!
            petugas: selectedForShift.map(m => `${m.full_name} (${m.class_grade} - ${m.organization_role})`)
          });
        }
        dailyRoster.sesi.push(sessionData);
      }
      generatedSchedule.push(dailyRoster);
    }

    // ==========================================
    // ✨ KODE BARU: SIMPAN JUMLAH TUGAS KE DATABASE
    // ==========================================
    for (const member of availableMembers) {
      // Hanya update ke database kalau jumlah tugasnya beneran nambah
      if (member.current_duty > (member.duty_count || 0)) {
        await supabase
          .from('members')
          .update({ duty_count: member.current_duty })
          .eq('id', member.id);
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'MPK berhasil diseret masuk! Ferdi & Cecil aman dari kerja rodi.',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}