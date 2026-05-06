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

    // Buku Catatan Keadilan: Melacak jumlah tugas dalam minggu ini
    let weeklyCount = new Map();

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
          
          // Ambil semua anggota yang belum bertugas hari ini
          let pool = availableMembers.filter(m => !assignedToday.has(m.id));

          // ✨ KEADILAN TOTAL: Urutkan murni dari yang tugasnya paling sedikit
          pool.sort((a, b) => {
            let aWeek = weeklyCount.get(a.id) || 0;
            let bWeek = weeklyCount.get(b.id) || 0;
            if (aWeek !== bWeek) return aWeek - bWeek; // Prioritas 1: Pemerataan minggu ini
            return (a.current_duty || 0) - (b.current_duty || 0); // Prioritas 2: Total tugas seumur hidup
          });

          // Fungsi Pemilih Organisasi
          const tryPick = (reqRole: string | null) => {
            let index = pool.findIndex(m => {
              if (reqRole === 'OSIS' && !m.organization_role.toUpperCase().includes('OSIS')) return false;
              if (reqRole === 'MPK' && !m.organization_role.toUpperCase().includes('MPK')) return false;
              return true; // Lolos filter
            });

            if (index !== -1) {
              let candidate = pool[index];
              pool.splice(index, 1); // Cabut kandidat dari kolam
              
              assignedToday.add(candidate.id);
              weeklyCount.set(candidate.id, (weeklyCount.get(candidate.id) || 0) + 1);
              
              let dbIdx = availableMembers.findIndex(am => am.id === candidate.id);
              if (dbIdx !== -1) availableMembers[dbIdx].current_duty += 1;
              
              selectedForShift.push(candidate);
              return true;
            }
            return false;
          };

          // TAHAP 1: FORMASI CAMPURAN (Berusaha membuat rasio OSIS & MPK seimbang)
          // Kita pakai pola: OSIS -> MPK -> OSIS -> MPK -> OSIS
          tryPick('OSIS'); 
          tryPick('MPK'); 
          tryPick('OSIS'); 
          tryPick('MPK'); 
          tryPick('OSIS');

          // TAHAP 2: PENAMBALAN BEBAS (Kalau gagal membentuk formasi di atas karena salah satu habis)
          while (selectedForShift.length < program.members_required_per_shift) {
            if (!tryPick(null)) break; // Ambil SIAPA SAJA yang ada di kolam secara acak
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

    // Auto-Save ke DB
    for (const member of availableMembers) {
      if (member.current_duty > (member.duty_count || 0)) {
        await supabase.from('members').update({ duty_count: member.current_duty }).eq('id', member.id);
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Jadwal Fleksibel Sukses! OSIS/MPK Campur & Beban Terbagi Rata.',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}