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

    const isClassXI = (grade: string) => grade && (grade.startsWith('XI') || grade.includes('11'));
    const isClassX = (grade: string) => grade && !isClassXI(grade) && (grade.startsWith('X') || grade.includes('10'));

    let weeklyCount = new Map();

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set(); // Mencegah kerja 2x dalam sehari

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          let selectedForShift: any[] = [];
          
          let pool = availableMembers.filter(m => !assignedToday.has(m.id));

          // ✨ INTI DARI KEADILAN: Selalu prioritaskan yang tugasnya paling sedikit!
          pool.sort((a, b) => {
            let aWeek = weeklyCount.get(a.id) || 0;
            let bWeek = weeklyCount.get(b.id) || 0;
            if (aWeek !== bWeek) return aWeek - bWeek; 
            return (a.current_duty || 0) - (b.current_duty || 0);
          });

          const tryPick = (reqClass: string | null, reqRole: string | null) => {
            let index = pool.findIndex(m => {
              if (reqClass === 'XI' && !isClassXI(m.class_grade)) return false;
              if (reqClass === 'X' && !isClassX(m.class_grade)) return false;
              if (reqRole === 'OSIS' && m.organization_role !== 'OSIS') return false;
              if (reqRole === 'MPK' && m.organization_role !== 'MPK') return false;
              return true;
            });

            if (index !== -1) {
              let candidate = pool[index];
              pool.splice(index, 1); 
              assignedToday.add(candidate.id);
              weeklyCount.set(candidate.id, (weeklyCount.get(candidate.id) || 0) + 1);
              let dbIdx = availableMembers.findIndex(am => am.id === candidate.id);
              if (dbIdx !== -1) availableMembers[dbIdx].current_duty += 1;
              selectedForShift.push(candidate);
              return true;
            }
            return false;
          };

          // TAHAP 1: IDEAL (Cari yang kelasnya pas, perannya digabung OSIS & MPK)
          if (program.name === 'SASAMU') {
            tryPick('XI', 'OSIS'); tryPick('XI', 'MPK'); tryPick('XI', 'OSIS');
            tryPick('X', 'MPK'); tryPick('X', 'OSIS');
          } else {
            let tClass = session === 'Pagi' ? 'XI' : 'X';
            tryPick(tClass, 'OSIS'); tryPick(tClass, 'MPK'); tryPick(tClass, 'OSIS');
            tryPick(tClass, 'MPK'); tryPick(tClass, 'OSIS');
          }

          // TAHAP 2: KELAS PAS (Kalau MPK/OSIS habis, ambil siapa aja asalkan dari kelas yang TEPAT)
          while (selectedForShift.length < program.members_required_per_shift) {
            let tClass = program.name === 'SASAMU' ? null : (session === 'Pagi' ? 'XI' : 'X');
            if (!tryPick(tClass, null)) break; 
          }

          // TAHAP 3: DARURAT (Mending kelasnya kecampur daripada jadwal kosong melompong)
          while (selectedForShift.length < program.members_required_per_shift) {
            if (!tryPick(null, null)) break; 
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
      message: 'Jadwal Penuh! MPK dilibatkan & Tugas merata otomatis.',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}