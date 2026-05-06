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

    let generatedSchedule = [];
    let availableMembers = [...members].map(m => ({ ...m, current_duty: m.duty_count }));

    const SESSIONS = ['Pagi', 'Siang'];
    
    // Daftar 14 BPH Sakti
    const BPH_NAMES = ['cecillia', 'adam', 'fadhli', 'ferdi', 'anggun', 'inez', 'lulu', 'erlangga', 'nayra', 'desti', 'febri tanjung', 'elisa', 'juansyah', 'luqman'];
    const isBPH = (name: string) => BPH_NAMES.some(bph => name.toLowerCase().includes(bph));

    // Pelacak Kuota Mingguan Spesifik Per Program
    let sasamuCountWeek = new Map();
    let jamparikuCountWeek = new Map();

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      
      // MENCEGAH DOUBLE SHIFT DALAM 1 HARI (Siapapun dia, kalau udah tugas hari ini, coret!)
      let assignedToday = new Set(); 

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          let selectedForShift: any[] = [];
          
          let bphInShift = 0;
          let maxBphPerShift = program.name === 'SASAMU' ? 1 : 2; 

          const pickMember = (reqClass: string) => {
            // Saring yang BELUM tugas hari ini dan sesuai KELAS
            let pool = availableMembers.filter(m => 
              !assignedToday.has(m.id) && 
              m.class_grade.startsWith(reqClass === 'XI' ? 'XI' : 'X.')
            );

            // Pisahkan kolam BPH dan Anggota Biasa
            let bphPool = pool.filter(m => isBPH(m.full_name));
            let nonBphPool = pool.filter(m => !isBPH(m.full_name));

            // SARING BERDASARKAN KUOTA MINGGUAN PROGRAM
            if (program.name === 'SASAMU') {
              // Kuota Sasamu -> BPH: Max 1, Biasa: Max 1
              bphPool = bphPool.filter(m => (sasamuCountWeek.get(m.id) || 0) < 1);
              nonBphPool = nonBphPool.filter(m => (sasamuCountWeek.get(m.id) || 0) < 1);
            } else {
              // Kuota Jampariku -> BPH: Max 2, Biasa: Max 1
              bphPool = bphPool.filter(m => (jamparikuCountWeek.get(m.id) || 0) < 2);
              nonBphPool = nonBphPool.filter(m => (jamparikuCountWeek.get(m.id) || 0) < 1);
            }

            // Pengurutan agar pembagian adil (Mendahulukan yang total tugasnya masih sedikit)
            const sorter = (a: any, b: any) => {
              let aTotal = (sasamuCountWeek.get(a.id) || 0) + (jamparikuCountWeek.get(a.id) || 0);
              let bTotal = (sasamuCountWeek.get(b.id) || 0) + (jamparikuCountWeek.get(b.id) || 0);
              if (aTotal !== bTotal) return aTotal - bTotal; 
              return a.current_duty - b.current_duty;
            };

            bphPool.sort(sorter);
            nonBphPool.sort(sorter);

            let selected = null;

            // 1. Masukkan BPH (selama shift belum kebanyakan BPH)
            if (bphInShift < maxBphPerShift && bphPool.length > 0) {
              selected = bphPool[0];
              bphInShift++;
            } 
            // 2. Masukkan Anggota Biasa
            else if (nonBphPool.length > 0) {
              selected = nonBphPool[0];
            } 
            // 3. Cadangan BPH (Kalau non-BPH kelas tersebut habis sama sekali)
            else if (bphPool.length > 0) {
              selected = bphPool[0];
              bphInShift++;
            }

            if (selected) {
              assignedToday.add(selected.id);
              
              if (program.name === 'SASAMU') sasamuCountWeek.set(selected.id, (sasamuCountWeek.get(selected.id) || 0) + 1);
              else jamparikuCountWeek.set(selected.id, (jamparikuCountWeek.get(selected.id) || 0) + 1);
              
              const idx = availableMembers.findIndex(am => am.id === selected.id);
              availableMembers[idx].current_duty += 1;
              selectedForShift.push(selected);
            }
          };

          // --- EKSEKUSI PEMILIHAN ---
          if (program.name === 'SASAMU') {
            pickMember('XI'); pickMember('XI'); pickMember('XI'); // 3 Orang Kelas XI
            pickMember('X'); pickMember('X');                     // 2 Orang Kelas X
          } else {
            let targetClass = session === 'Pagi' ? 'XI' : 'X';
            for (let k = 0; k < 5; k++) pickMember(targetClass);  // Full sesuai sesi
          }

          // --- PROTOKOL DARURAT ---
          // Jaga-jaga jika anggota benar-benar habis karena limit mingguan terlalu ketat,
          // sistem akan mengabaikan limit mingguan demi mengisi kuota 5 orang per shift.
          while (selectedForShift.length < program.members_required_per_shift) {
            let emergencyPool = availableMembers.filter(m => !assignedToday.has(m.id)); // Pokoknya jangan double hari ini
            if (emergencyPool.length > 0) {
              let selected = emergencyPool[0];
              assignedToday.add(selected.id);
              selectedForShift.push(selected);
              const idx = availableMembers.findIndex(am => am.id === selected.id);
              availableMembers[idx].current_duty += 1;
            } else {
              break; 
            }
          }

          sessionData.tugas.push({
            program: program.name,
            petugas: selectedForShift.map(m => `${m.full_name} (${m.class_grade} - ${m.organization_role})`)
          });
        }
        dailyRoster.sesi.push(sessionData);
      }
      generatedSchedule.push(dailyRoster);
    }

    return NextResponse.json({
      status: 'success',
      message: 'Jadwal Sukses! (Biasa: 1 Sasamu + 1 Jampariku, BPH: 1 Sasamu + 2 Jampariku, Tanpa Double Shift Harian)',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}