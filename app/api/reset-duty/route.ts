import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST() {
  try {
    // Supabase butuh filter untuk update massal. 
    // Kita bilang: "Update jadi 0 untuk semua anggota yang tugasnya lebih dari atau sama dengan 0" (Artinya semuanya!)
    const { error } = await supabase
      .from('members')
      .update({ duty_count: 0 })
      .gte('duty_count', 0); 

    if (error) throw error;

    return NextResponse.json({
      status: 'success',
      message: 'Seluruh jumlah tugas berhasil di-reset ke 0!'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}