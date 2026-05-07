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
    const isClassXI = (g: string) => g && (g.startsWith('XI') || g.includes('11'));
    const isClassX = (g: string) => g && !isClassXI(g) && (g.startsWith('X') || g.includes('10'));

    // Track jatah per program per minggu
    let sasamuWeekly = new Map();
    let jamparikuWeekly = new Map();

    let generatedSchedule = [];

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set(); // Mencegah tugas double di hari yang sama

      for (const session of ['Pagi', 'Siang']) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          let selected = [];
          
          // Pool anggota yang belum tugas HARI INI
          let pool = availableMembers.filter(m => !assignedToday.has(m.id));

          // Sorting Keadilan: Prioritaskan yang tugas mingguan program ini masih 0
          pool.sort((a, b) => {
            const aCount = program.name === 'SASAMU' ? (sasamuWeekly.get(a.id) || 0) : (jamparikuWeekly.get(a.id) || 0);
            const bCount = program.name === 'SASAMU' ? (sasamuWeekly.get(b.id) || 0) : (jamparikuWeekly.get(b.id) || 0);
            if (aCount !== bCount) return aCount - bCount;
            return a.current_duty - b.current_duty;
          });

          for (const m of pool) {
            if (selected.length < 5) {
              // Aturan JAMPARIKU: Pagi = XI, Siang = X
              if (program.name === 'JAMPARIKU') {
                if (session === 'Pagi' && !isClassXI(m.class_grade)) continue;
                if (session === 'Siang' && !isClassX(m.class_grade)) continue;
              }

              // Batasan Jatah Mingguan
              const currentSasamu = sasamuWeekly.get(m.id) || 0;
              const currentJampariku = jamparikuWeekly.get(m.id) || 0;
              const bph = isBPH(m.full_name);

              if (program.name === 'SASAMU') {
                if (currentSasamu >= (bph ? 2 : 1)) continue; // BPH boleh 2x Sasamu jika darurat
              } else {
                if (currentJampariku >= (bph ? 2 : 1)) continue; // BPH boleh 2x Jampariku
              }

              selected.push(m);
              assignedToday.add(m.id);
              
              if (program.name === 'SASAMU') sasamuWeekly.set(m.id, currentSasamu + 1);
              else jamparikuWeekly.set(m.id, currentJampariku + 1);

              const idx = availableMembers.findIndex(am => am.id === m.id);
              availableMembers[idx].current_duty += 1;
            }
          }

          sessionData.tugas.push({
            program: program.name,
            petugas: selected.map(m => `${m.full_name} (${m.class_grade})`)
          });
        }
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