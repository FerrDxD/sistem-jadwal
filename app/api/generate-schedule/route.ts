import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, days = 5 } = body;

    const { data: members, error: membersError } = await supabase.from('members').select('*').eq('is_active', true);
    if (membersError) throw membersError;

    const { data: programs, error: programsError } = await supabase.from('programs').select('*');
    if (programsError) throw programsError;

    let availableMembers = [...members].map(m => ({ ...m, current_duty: m.duty_count || 0 }));
    const BPH_NAMES = ['cecillia', 'adam', 'fadhli', 'ferdi', 'anggun', 'inez', 'lulu', 'erlangga', 'nayra', 'febriyanti', 'desti elisa', 'juansyah', 'luqman'];
    
    const isBPH = (name: string) => name && BPH_NAMES.some(b => name.toLowerCase().includes(b));
    const isClassXI = (g: string) => g && (g.toUpperCase().startsWith('XI') || g.includes('11'));
    const isClassX = (g: string) => g && !isClassXI(g) && (g.toUpperCase().startsWith('X') || g.includes('10'));

    let sasamuWeekly = new Map();
    let jamparikuWeekly = new Map();

    let generatedSchedule = [];

    // 🚀 PERUBAHAN KUNCI: JAMPARIKU diproses duluan agar stok kelas XI tidak "dicuri" SASAMU
    const orderedPrograms = [...programs].sort((a, b) => a.name === 'JAMPARIKU' ? -1 : 1);

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set(); // Mencegah jadwal bentrok di hari yang sama

      for (const session of ['Pagi', 'Siang']) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of orderedPrograms) {
          let selected = [];
          
          let pool = availableMembers.filter(m => !assignedToday.has(m.id));

          // Sorting: Prioritaskan yang kuota mingguan program ini masih 0
          pool.sort((a, b) => {
            const aCount = program.name === 'SASAMU' ? (sasamuWeekly.get(a.id) || 0) : (jamparikuWeekly.get(a.id) || 0);
            const bCount = program.name === 'SASAMU' ? (sasamuWeekly.get(b.id) || 0) : (jamparikuWeekly.get(b.id) || 0);
            if (aCount !== bCount) return aCount - bCount;
            return a.current_duty - b.current_duty;
          });

          // Fungsi Pemilih dengan Saklar "Darurat"
          const tryPick = (ignoreLimits: boolean) => {
            let index = pool.findIndex(m => {
              // Aturan Kelas JAMPARIKU
              if (program.name === 'JAMPARIKU') {
                if (session === 'Pagi' && !isClassXI(m.class_grade)) return false;
                if (session === 'Siang' && !isClassX(m.class_grade)) return false;
              }

              // Aturan Limit Mingguan (Hanya berlaku jika stok masih ada)
              if (!ignoreLimits) {
                const currentSasamu = sasamuWeekly.get(m.id) || 0;
                const currentJampariku = jamparikuWeekly.get(m.id) || 0;
                const bph = isBPH(m.full_name);

                if (program.name === 'SASAMU') {
                  if (currentSasamu >= (bph ? 2 : 1)) return false;
                } else {
                  if (currentJampariku >= (bph ? 2 : 1)) return false;
                }
              }
              
              return true;
            });

            if (index !== -1) {
              let m = pool[index];
              pool.splice(index, 1);
              selected.push(m);
              assignedToday.add(m.id);
              
              if (program.name === 'SASAMU') sasamuWeekly.set(m.id, (sasamuWeekly.get(m.id) || 0) + 1);
              else jamparikuWeekly.set(m.id, (jamparikuWeekly.get(m.id) || 0) + 1);

              const dbIdx = availableMembers.findIndex(am => am.id === m.id);
              if (dbIdx !== -1) availableMembers[dbIdx].current_duty += 1;
              return true;
            }
            return false;
          };

          // TAHAP 1: Eksekusi Ideal (Mematuhi batas tugas mingguan)
          while (selected.length < program.members_required_per_shift) {
            if (!tryPick(false)) break;
          }

          // TAHAP 2: PROTOKOL STOK HABIS (Sesuai idemu: Mengabaikan limit mingguan demi kuota 5 orang)
          while (selected.length < program.members_required_per_shift) {
            if (!tryPick(true)) break; 
          }

          sessionData.tugas.push({
            program: program.name,
            petugas: selected.map(m => `${m.full_name} (${m.class_grade})`)
          });
        }
        
        // Kembalikan urutan tampilan array agar SASAMU tampil di atas JAMPARIKU di web
        sessionData.tugas.sort((a, b) => a.program === 'SASAMU' ? -1 : 1);
        dailyRoster.sesi.push(sessionData);
      }
      generatedSchedule.push(dailyRoster);
    }

    // Sync ke DB
    for (const m of availableMembers) {
      if (m.current_duty > (m.duty_count || 0)) {
        await supabase.from('members').update({ duty_count: m.current_duty }).eq('id', m.id);
      }
    }

    return NextResponse.json({ status: 'success', schedule: generatedSchedule });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}