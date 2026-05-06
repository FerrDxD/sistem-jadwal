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
      return NextResponse.json({ error: 'Tidak ada anggota aktif yang tersedia.' }, { status: 400 });
    }

    let generatedSchedule = [];
    let availableMembers = [...members].map(m => ({ 
      ...m, 
      current_duty: m.duty_count 
    }));

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = {
        tanggal: dateString,
        tugas: [] as any[]
      };

      let assignedToday = new Set();

      for (const program of programs) {
        
        availableMembers.sort((a, b) => a.current_duty - b.current_duty);

        let selectedForProgram = [];
        // Variabel penahan (counter) untuk rasio OSIS & MPK
        let countOSIS = 0;
        let countMPK = 0;
        
        for (const member of availableMembers) {
          if (selectedForProgram.length < program.members_required_per_shift) {
            if (!assignedToday.has(member.id)) {
              
              // LOGIKA BARU: Batasi maksimal 3 orang per organisasi
              if (member.organization_role === 'OSIS' && countOSIS >= 3) continue;
              if (member.organization_role === 'MPK' && countMPK >= 3) continue;

              selectedForProgram.push(member);
              assignedToday.add(member.id);
              member.current_duty += 1;

              // Tambah hitungan sesuai asal organisasinya
              if (member.organization_role === 'OSIS') countOSIS++;
              else if (member.organization_role === 'MPK') countMPK++;
            }
          }
        }

        dailyRoster.tugas.push({
          program: program.name,
          // Tambahkan embel-embel organisasi di belakang nama untuk bukti visual
          petugas: selectedForProgram.map(m => `${m.full_name} (${m.organization_role})`)
        });
      }
      
      generatedSchedule.push(dailyRoster);
    }

    return NextResponse.json({
      status: 'success',
      message: 'Jadwal berhasil digenerate dengan rasio seimbang!',
      schedule: generatedSchedule
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan internal.' },
      { status: 500 }
    );
  }
}