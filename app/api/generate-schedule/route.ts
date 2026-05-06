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

    if (!members || members.length === 0) {
      throw new Error("Tidak ada data anggota di database.");
    }

    let generatedSchedule = [];
    let availableMembers = [...members].map(m => ({ ...m, current_duty: m.duty_count || 0 }));

    const SESSIONS = ['Pagi', 'Siang'];
    const BPH_NAMES = ['cecillia', 'adam', 'fadhli', 'ferdi', 'anggun', 'inez', 'lulu', 'erlangga', 'nayra', 'desti', 'febri tanjung', 'elisa', 'juansyah', 'luqman'];
    
    const isBPH = (name: string) => {
      if (!name) return false;
      return BPH_NAMES.some(bph => name.toLowerCase().includes(bph.toLowerCase()));
    };

    // Deteksi kelas super ketat
    const isClassXI = (grade: string) => grade && (grade.startsWith('XI.') || grade.startsWith('XI ') || grade === 'XI');
    const isClassX = (grade: string) => grade && !isClassXI(grade) && (grade.startsWith('X.') || grade.startsWith('X ') || grade === 'X');

    let sasamuCountWeek = new Map();
    let jamparikuCountWeek = new Map();

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      
      // HARGA MATI: 1 Hari = 1 Tugas
      let assignedToday = new Set(); 

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          let selectedForShift: any[] = [];
          let bphInShift = 0;
          let maxBphPerShift = program.name === 'SASAMU' ? 1 : 2;

          const pickAndAssign = (reqClass: string) => {
            // 1. FILTER MUTLAK (Sama sekali tidak boleh dilanggar)
            let validPool = availableMembers.filter(m => {
              if (assignedToday.has(m.id)) return false; // Udah tugas hari ini? Coret.
              if (!m.class_grade) return false;
              if (reqClass === 'XI' && !isClassXI(m.class_grade)) return false; // Bukan XI? Coret.
              if (reqClass === 'X' && !isClassX(m.class_grade)) return false;   // Bukan X? Coret.
              return true;
            });

            // 2. FILTER IDEAL (Ikuti aturan batas mingguan)
            let idealPool = validPool.filter(m => {
              let bph = isBPH(m.full_name);
              if (program.name === 'SASAMU') return (sasamuCountWeek.get(m.id) || 0) < 1;
              return (jamparikuCountWeek.get(m.id) || 0) < (bph ? 2 : 1);
            });

            // 3. POOL CADANGAN (Jika orangnya habis, terpaksa langgar batas mingguan ASALKAN KELASNYA BENAR)
            let backupPool = validPool.filter(m => !idealPool.includes(m));

            // Urutkan supaya adil dan merata
            const sorter = (a: any, b: any) => {
              let aTotal = (sasamuCountWeek.get(a.id) || 0) + (jamparikuCountWeek.get(a.id) || 0);
              let bTotal = (sasamuCountWeek.get(b.id) || 0) + (jamparikuCountWeek.get(b.id) || 0);
              if (aTotal !== bTotal) return aTotal - bTotal; 
              return (a.current_duty || 0) - (b.current_duty || 0);
            };

            idealPool.sort(sorter);
            backupPool.sort(sorter);

            let candidate = null;

            // Cari di kumpulan Ideal dulu (BPH jangan sampai ngumpul)
            candidate = idealPool.find(m => !(isBPH(m.full_name) && bphInShift >= maxBph));
            if (!candidate && idealPool.length > 0) candidate = idealPool[0]; // Terobos batas kumpul BPH
            
            // Kalau kumpulan ideal bener-bener habis, cari di kumpulan Cadangan
            if (!candidate) candidate = backupPool.find(m => !(isBPH(m.full_name) && bphInShift >= maxBph));
            if (!candidate && backupPool.length > 0) candidate = backupPool[0];

            if (candidate) {
              assignedToday.add(candidate.id);
              if (program.name === 'SASAMU') sasamuCountWeek.set(candidate.id, (sasamuCountWeek.get(candidate.id) || 0) + 1);
              else jamparikuCountWeek.set(candidate.id, (jamparikuCountWeek.get(candidate.id) || 0) + 1);
              
              const idx = availableMembers.findIndex(am => am.id === candidate.id);
              if (idx !== -1) availableMembers[idx].current_duty += 1;
              
              if (isBPH(candidate.full_name)) bphInShift++;
              selectedForShift.push(candidate);
            }
          };

          // EKSEKUSI PEMANGGILAN ANGGOTA BERDASARKAN KELAS
          if (program.name === 'SASAMU') {
            pickAndAssign('XI'); pickAndAssign('XI'); pickAndAssign('XI');
            pickAndAssign('X'); pickAndAssign('X');
          } else {
            let targetClass = session === 'Pagi' ? 'XI' : 'X';
            for (let k = 0; k < 5; k++) pickAndAssign(targetClass);
          }

          sessionData.tugas.push({
            program: program.name,
            // Aku hapus keterangan (OSIS/MPK) dan sisakan kelas aja, biar kamu gampang mantau kalau kelasnya udah 100% rapi
            petugas: selectedForShift.map(m => `${m.full_name} (${m.class_grade})`)
          });
        }
        dailyRoster.sesi.push(sessionData);
      }
      generatedSchedule.push(dailyRoster);
    }

    return NextResponse.json({
      status: 'success',
      message: 'Jadwal SUPER KETAT berhasil! (Aturan kelas MUTLAK dituruti).',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    console.error("Backend Error:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}