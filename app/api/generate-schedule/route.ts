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

    const isClassXI = (grade: string) => grade && (grade.startsWith('XI.') || grade.startsWith('XI ') || grade === 'XI');
    const isClassX = (grade: string) => grade && !isClassXI(grade) && (grade.startsWith('X.') || grade.startsWith('X ') || grade === 'X');

    let sasamuCountWeek = new Map();
    let jamparikuCountWeek = new Map();

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set(); // Harga Mati: Sehari 1 kali tugas

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          let selectedForShift: any[] = [];
          let bphInShift = 0;
          let maxBphPerShift = program.name === 'SASAMU' ? 1 : 2;

          // Fungsi pencabut anggota yang super canggih
          const pickMember = (reqClass: string, forceClass: boolean) => {
            let pool = availableMembers.filter(m => !assignedToday.has(m.id) && m.class_grade);

            // Urutkan pool berdasarkan yang PALING SEDIKIT TUGAS agar adil
            pool.sort((a, b) => {
              let aTotal = (sasamuCountWeek.get(a.id) || 0) + (jamparikuCountWeek.get(a.id) || 0);
              let bTotal = (sasamuCountWeek.get(b.id) || 0) + (jamparikuCountWeek.get(b.id) || 0);
              if (aTotal !== bTotal) return aTotal - bTotal; 
              return (a.current_duty || 0) - (b.current_duty || 0);
            });

            const matchesClass = (m: any) => {
              if (reqClass === 'XI') return isClassXI(m.class_grade);
              if (reqClass === 'X') return isClassX(m.class_grade);
              return false;
            };

            const isValid = (m: any, checkIdealLimit: boolean, checkClass: boolean, bypassBphLimit: boolean) => {
              if (checkClass && !matchesClass(m)) return false;
              
              let bph = isBPH(m.full_name);
              if (!bypassBphLimit && bph && bphInShift >= maxBphPerShift) return false;

              if (checkIdealLimit) {
                // LIMIT IDEAL: Sasamu 1, Jampariku (BPH 2, Biasa 1)
                if (program.name === 'SASAMU') return (sasamuCountWeek.get(m.id) || 0) < 1;
                return (jamparikuCountWeek.get(m.id) || 0) < (bph ? 2 : 1);
              } else {
                // LIMIT MAKSIMAL (Opsi C): Sasamu boleh 2 kali kalau terpaksa
                if (program.name === 'SASAMU') return (sasamuCountWeek.get(m.id) || 0) < 2; 
                return (jamparikuCountWeek.get(m.id) || 0) < (bph ? 3 : 2);
              }
            };

            let candidate = null;

            // 1. Cari yang Ideal (Kelas Pas + Limit Ideal + BPH belum numpuk)
            candidate = pool.find(m => isValid(m, true, true, false));
            // 2. Kalau BPH numpuk, terobos aja BPH-nya
            if(!candidate) candidate = pool.find(m => isValid(m, true, true, true));
            // 3. Kalau limit ideal habis, pakai Opsi C (Naikkan limit mingguan)
            if(!candidate) candidate = pool.find(m => isValid(m, false, true, false));
            if(!candidate) candidate = pool.find(m => isValid(m, false, true, true));

            // JIKA SASAMU: Boleh pakai Opsi A (Abaikan aturan kelas demi 5 orang)
            if (!candidate && !forceClass) {
              candidate = pool.find(m => isValid(m, true, false, true)); // Cari kelas bebas, limit ideal
              if(!candidate) candidate = pool.find(m => isValid(m, false, false, true)); // Cari kelas bebas, limit maksimal
            }

            if (candidate) {
              assignedToday.add(candidate.id);
              if (isBPH(candidate.full_name)) bphInShift++;
              
              if (program.name === 'SASAMU') sasamuCountWeek.set(candidate.id, (sasamuCountWeek.get(candidate.id) || 0) + 1);
              else jamparikuCountWeek.set(candidate.id, (jamparikuCountWeek.get(candidate.id) || 0) + 1);
              
              const idx = availableMembers.findIndex(am => am.id === candidate.id);
              if (idx !== -1) availableMembers[idx].current_duty += 1;
              
              selectedForShift.push(candidate);
            }
          };

          if (program.name === 'SASAMU') {
            // Target 3 XI dan 2 X, tapi tidak dipaksa (forceClass = false)
            pickMember('XI', false); pickMember('XI', false); pickMember('XI', false);
            pickMember('X', false); pickMember('X', false);
          } else {
            // Jampariku WAJIB sesuai kelas (forceClass = true)
            let targetClass = session === 'Pagi' ? 'XI' : 'X';
            for (let k = 0; k < 5; k++) pickMember(targetClass, true);
          }

          sessionData.tugas.push({
            program: program.name,
            petugas: selectedForShift.map(m => `${m.full_name} (${m.class_grade})`)
          });
        }
        dailyRoster.sesi.push(sessionData);
      }
      generatedSchedule.push(dailyRoster);
    }

    return NextResponse.json({
      status: 'success',
      message: 'Jadwal Sukses! (Jampariku Harga Mati, Sasamu Fleksibel)',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}