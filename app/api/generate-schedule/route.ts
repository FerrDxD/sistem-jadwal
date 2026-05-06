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

    // Variabel pelacak tugas selama 1 minggu penuh
    let assignedThisWeek = new Set(); 

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];

      let dailyRoster = { tanggal: dateString, sesi: [] as any[] };
      let assignedToday = new Set();
      let bphAssignedToday = new Map(); 

      for (const session of SESSIONS) {
        let sessionData = { nama_sesi: session, tugas: [] as any[] };

        for (const program of programs) {
          
          let eligibleMembers = availableMembers.filter(m => {
            // 1. Aturan Kelas JAMPARIKU (Pagi=XI, Siang=X)
            if (program.name === 'JAMPARIKU') {
              if (session === 'Pagi' && !m.class_grade.startsWith('XI')) return false;
              if (session === 'Siang' && !m.class_grade.startsWith('X.')) return false;
            }

            // 2. Aturan Perlindungan Non-BPH
            if (!isBPH(m.full_name)) {
              // Jika BUKAN BPH, pastikan dia belum pernah tugas minggu ini
              if (assignedThisWeek.has(m.id)) return false;
            } else {
              // Jika BPH, pastikan dia tidak jaga lebih dari 2x dalam sehari
              if (assignedToday.has(m.id) && (bphAssignedToday.get(m.id) || 0) >= 2) return false;
            }

            return true;
          });

          // Mengurutkan: Prioritaskan Non-BPH yang belum pernah tugas, baru gunakan BPH
          eligibleMembers.sort((a, b) => {
            const aAssigned = assignedThisWeek.has(a.id) ? 1 : 0;
            const bAssigned = assignedThisWeek.has(b.id) ? 1 : 0;
            if (aAssigned !== bAssigned) return aAssigned - bAssigned;
            return a.current_duty - b.current_duty;
          });

          let selected = [];
          let countOSIS = 0;
          let countMPK = 0;
          let skippedDueToRatio = [];

          // TAHAP 1: Pilih anggota sambil mencoba mempertahankan rasio 3:2
          for (const member of eligibleMembers) {
            if (selected.length < program.members_required_per_shift) {
              if (member.organization_role === 'OSIS' && countOSIS >= 3) {
                skippedDueToRatio.push(member);
                continue;
              }
              if (member.organization_role === 'MPK' && countMPK >= 3) {
                skippedDueToRatio.push(member);
                continue;
              }

              selected.push(member);
              assignedToday.add(member.id);
              assignedThisWeek.add(member.id);
              
              if (isBPH(member.full_name)) {
                bphAssignedToday.set(member.id, (bphAssignedToday.get(member.id) || 0) + 1);
              }

              const idx = availableMembers.findIndex(am => am.id === member.id);
              availableMembers[idx].current_duty += 1;

              if (member.organization_role === 'OSIS') countOSIS++;
              else countMPK++;
            }
          }

          // TAHAP 2: Jika masih kurang dari 5 orang, buang aturan rasio dan panggil yang tadi dilewati
          if (selected.length < program.members_required_per_shift) {
            for (const member of skippedDueToRatio) {
              if (selected.length < program.members_required_per_shift) {
                selected.push(member);
                assignedToday.add(member.id);
                assignedThisWeek.add(member.id);
                
                if (isBPH(member.full_name)) {
                  bphAssignedToday.set(member.id, (bphAssignedToday.get(member.id) || 0) + 1);
                }
                const idx = availableMembers.findIndex(am => am.id === member.id);
                availableMembers[idx].current_duty += 1;
              }
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
      message: 'Jadwal 5 orang terisi penuh! Non-BPH aman 1x tugas, BPH kerja ekstra 🫡',
      schedule: generatedSchedule
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}