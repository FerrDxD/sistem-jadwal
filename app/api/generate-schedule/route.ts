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
    
    // Daftar BPH Sakti yang boleh Double Job
    const BPH_NAMES = ['cecillia', 'adam', 'fadhli', 'ferdi', 'anggun', 'inez', 'lulu', 'erlangga', 'nayra', 'desti', 'febri tanjung', 'elisa', 'juansyah', 'luqman'];
    const isBPH = (name: string) => BPH_NAMES.some(bph => name.toLowerCase().includes(bph));

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set();
      let bphAssignedCount = new Map(); // Menghitung job harian BPH agar tidak > 2

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          
          let eligibleMembers = availableMembers.filter(m => {
            // 1. Aturan Kelas JAMPARIKU
            if (program.name === 'JAMPARIKU') {
              if (session === 'Pagi' && !m.class_grade.startsWith('XI')) return false;
              if (session === 'Siang' && !m.class_grade.startsWith('X.')) return false;
            }

            // 2. Aturan Double Job
            if (assignedToday.has(m.id)) {
              if (isBPH(m.full_name)) {
                // BPH boleh double job, tapi maksimal 2 per hari
                if ((bphAssignedCount.get(m.id) || 0) >= 2) return false;
                return true; 
              }
              return false; // Bukan BPH = Tidak boleh double job
            }
            return true;
          });

          // Prioritaskan yang tugasnya masih sedikit
          eligibleMembers.sort((a, b) => a.current_duty - b.current_duty);

          let selected = [];
          let countOSIS = 0;
          let countMPK = 0;

          for (const member of eligibleMembers) {
            if (selected.length < program.members_required_per_shift) {
              // Aturan rasio 3:2 OSIS/MPK
              if (member.organization_role === 'OSIS' && countOSIS >= 3) continue;
              if (member.organization_role === 'MPK' && countMPK >= 3) continue;

              selected.push(member);
              assignedToday.add(member.id);
              
              if (isBPH(member.full_name)) {
                bphAssignedCount.set(member.id, (bphAssignedCount.get(member.id) || 0) + 1);
              }

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
      message: 'Jadwal 2 Sesi berhasil digenerate! (BPH dikerahkan untuk backup)',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}