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

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set(); // Supaya 1 orang tidak double shift di hari yang sama

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          // Filter anggota berdasarkan aturan kelas XI/X untuk JAMPARIKU
          let eligibleMembers = availableMembers.filter(m => !assignedToday.has(m.id));

          if (program.name === 'JAMPARIKU') {
            if (session === 'Pagi') {
              eligibleMembers = eligibleMembers.filter(m => m.class_grade.startsWith('XI'));
            } else {
              eligibleMembers = eligibleMembers.filter(m => m.class_grade.startsWith('X.'));
            }
          }

          // Urutkan berdasarkan yang paling jarang bertugas
          eligibleMembers.sort((a, b) => a.current_duty - b.current_duty);

          let selected = [];
          let countOSIS = 0;
          let countMPK = 0;

          for (const member of eligibleMembers) {
            if (selected.length < program.members_required_per_shift) {
              if (member.organization_role === 'OSIS' && countOSIS >= 3) continue;
              if (member.organization_role === 'MPK' && countMPK >= 3) continue;

              selected.push(member);
              assignedToday.add(member.id);
              
              // Update referensi tugas di list utama
              const idx = availableMembers.findIndex(am => am.id === member.id);
              availableMembers[idx].current_duty += 1;

              if (member.organization_role === 'OSIS') countOSIS++;
              else countMPK++;
            }
          }

          sessionData.tugas.push({
            program: program.name,
            petugas: selected.map(m => `${m.full_name} (${m.organization_role})`)
          });
        }
        dailyRoster.sesi.push(sessionData);
      }
      generatedSchedule.push(dailyRoster);
    }

    return NextResponse.json({
      status: 'success',
      message: 'Jadwal dua sesi berhasil dibuat sesuai aturan kelas!',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}