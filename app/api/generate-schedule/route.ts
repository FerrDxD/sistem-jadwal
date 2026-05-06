import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, days = 5 } = body;

    // 1. Ambil data program
    const { data: programs, error: programsError } = await supabase.from('programs').select('*');
    if (programsError) throw programsError;

    // 2. Ambil data anggota aktif
    const { data: members, error: membersError } = await supabase.from('members').select('*').eq('is_active', true);
    if (membersError) throw membersError;

    if (!members || members.length === 0) {
      return NextResponse.json({ error: 'Tidak ada anggota aktif yang tersedia.' }, { status: 400 });
    }

    // --- ALGORITMA PENJADWALAN ANTI-BENTROK ---
    let generatedSchedule = [];
    
    // Kita buat salinan data member agar bisa mengubah duty_count sementara selama kalkulasi
    let availableMembers = [...members].map(m => ({ 
      ...m, 
      current_duty: m.duty_count 
    }));

    // Looping berdasarkan jumlah hari (contoh: 5 hari kerja)
    for (let i = 0; i < days; i++) {
      // Setup tanggal
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = {
        tanggal: dateString,
        tugas: [] as any[]
      };

      // Set untuk melacak ID siapa saja yang sudah ditugaskan HARI INI agar tidak dobel/bentrok
      let assignedToday = new Set();

      // Looping untuk setiap program (SASAMU & JAMPARIKU)
      for (const program of programs) {
        
        // Urutkan anggota dari yang tugasnya paling sedikit (Greedy Algorithm untuk keadilan)
        availableMembers.sort((a, b) => a.current_duty - b.current_duty);

        let selectedForProgram = [];
        
        for (const member of availableMembers) {
          // Jika program ini masih butuh orang (misal butuh 4 orang)
          if (selectedForProgram.length < program.members_required_per_shift) {
            // Pastikan dia belum kebagian tugas lain di hari yang sama
            if (!assignedToday.has(member.id)) {
              selectedForProgram.push(member);
              assignedToday.add(member.id); // Kunci orang ini untuk hari ini
              member.current_duty += 1; // Tambah beban tugasnya di sistem
            }
          }
        }

        dailyRoster.tugas.push({
          program: program.name,
          petugas: selectedForProgram.map(m => m.full_name)
        });
      }
      
      generatedSchedule.push(dailyRoster);
    }

    // Kembalikan hasil jadwal yang sudah matang
    return NextResponse.json({
      status: 'success',
      message: 'Jadwal berhasil digenerate!',
      schedule: generatedSchedule
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan internal.' },
      { status: 500 }
    );
  }
}