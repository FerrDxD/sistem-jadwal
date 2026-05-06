"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { generateOfficialPDF } from '@/lib/generatePdf';

export default function Dashboard() {
  const [members, setMembers] = useState<any[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<any>(null);
  
  // State untuk menyembunyikan/menampilkan tabel anggota
  const [showMembers, setShowMembers] = useState(false);

  // State untuk Kalender: Membuat default tanggal otomatis ke hari Senin terdekat
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); 
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    const fetchMembers = async () => {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('class_grade', { ascending: true });
      
      if (!error && data) setMembers(data);
      setIsFetching(false);
    };
    fetchMembers();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateResult(null);

    try {
      const response = await fetch('/api/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startDate: startDate, // Sekarang tanggalnya dinamis mengambil dari kalender
          days: 5 
        }),
      });

      const result = await response.json();
      setGenerateResult(result);
    } catch (error) {
      console.error("Gagal men-generate jadwal:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-800 p-4 sm:p-6 md:p-12 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
        
        {/* --- HEADER SECTION --- */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white/60 backdrop-blur-xl border border-white/80 p-5 sm:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] gap-4 md:gap-0">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
              Sistem Automasi Jadwal
            </h1>
            <p className="text-slate-500 mt-1 sm:mt-2 text-sm sm:text-base font-medium">
              SASAMU & JAMPARIKU • SMAN 2 Jonggol
            </p>
          </div>
          
          {/* Kelompok Kalender & Tombol */}
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto mt-4 md:mt-0">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-3 sm:py-3.5 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-600 cursor-pointer"
            />
            
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full md:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed ${
                isGenerating 
                  ? 'bg-slate-400 shadow-none' 
                  : 'bg-gradient-to-r from-indigo-500 to-violet-600'
              }`}
            >
              {isGenerating ? '⚙️ Memproses...' : '✨ Generate Jadwal'}
            </button>
          </div>
        </header>

        {/* --- HASIL PENJADWALAN UI --- */}
        {generateResult && generateResult.status === 'success' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-indigo-50 p-5 sm:p-6 rounded-3xl border border-indigo-100 gap-4 md:gap-0">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-indigo-900">📅 Hasil Penjadwalan</h2>
                <p className="text-indigo-700/70 text-sm mt-1">{generateResult.message}</p>
              </div>
              <button 
                onClick={() => generateOfficialPDF(generateResult.schedule)}
                className="w-full md:w-auto px-6 py-2.5 bg-white text-indigo-600 font-bold rounded-xl shadow-sm border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-colors flex justify-center items-center gap-2"
              >
                🖨️ Cetak PDF Resmi
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {generateResult.schedule.map((hari: any, index: number) => {
                const dateObj = new Date(hari.tanggal);
                const formatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const formattedDate = formatter.format(dateObj);

                return (
                  <div key={index} className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                    <div className="border-b border-slate-100 pb-3 sm:pb-4 mb-3 sm:mb-4">
                      <h3 className="text-base sm:text-lg font-bold text-slate-800">{formattedDate}</h3>
                    </div>
                    
                    <div className="space-y-5 sm:space-y-6">
                      {hari.tugas.map((tugasData: any, idx: number) => (
                        <div key={idx}>
                          <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-2 sm:mb-3 flex items-center gap-2 ${
                            tugasData.program === 'SASAMU' ? 'text-blue-600' : 'text-emerald-600'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${tugasData.program === 'SASAMU' ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
                            {tugasData.program}
                          </h4>
                          
                          {tugasData.petugas.length > 0 ? (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {tugasData.petugas.map((nama: string, nIdx: number) => (
                                <li key={nIdx} className="bg-slate-50 px-3 sm:px-4 py-2 rounded-xl text-slate-600 text-xs sm:text-sm font-medium border border-slate-100 flex items-center gap-2 truncate">
                                  <div className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[9px] sm:text-[10px] text-slate-400 font-bold shadow-sm">
                                    {nama.charAt(0)}
                                  </div>
                                  <span className="truncate">{nama}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs sm:text-sm text-slate-400 italic">Tidak ada petugas tersedia.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- TABEL DATA ANGGOTA (DENGAN TOGGLE COLLAPSE) --- */}
        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden transition-all duration-300">
          
          <button 
            onClick={() => setShowMembers(!showMembers)}
            className="w-full px-5 py-4 sm:px-8 sm:py-6 flex justify-between items-center hover:bg-slate-50 transition-colors focus:outline-none"
          >
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
              👥 Daftar Anggota Pengurus 
              <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {members.length} Orang
              </span>
            </h2>
            <div className="text-slate-400 flex items-center gap-2 text-sm font-medium">
              <span className="hidden sm:inline">
                {showMembers ? 'Tutup Tabel' : 'Lihat Semua'}
              </span>
              <svg 
                className={`w-5 h-5 transform transition-transform duration-300 ${showMembers ? 'rotate-180' : ''}`} 
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {showMembers && (
            <div className="overflow-x-auto border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 text-[10px] sm:text-xs uppercase tracking-widest">
                    <th className="px-5 sm:px-8 py-3 sm:py-4 font-semibold">Nama Lengkap</th>
                    <th className="px-5 sm:px-8 py-3 sm:py-4 font-semibold">Kelas</th>
                    <th className="px-5 sm:px-8 py-3 sm:py-4 font-semibold text-right">Jumlah Tugas</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 divide-y divide-slate-50">
                  {isFetching ? (
                    <tr>
                      <td colSpan={3} className="px-5 sm:px-8 py-8 sm:py-12 text-center text-slate-400 animate-pulse text-sm">
                        Memuat data anggota...
                      </td>
                    </tr>
                  ) : members.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 sm:px-8 py-4 sm:py-5 font-medium group-hover:text-indigo-600 transition-colors text-xs sm:text-sm">
                        {member.full_name}
                      </td>
                      <td className="px-5 sm:px-8 py-4 sm:py-5 text-slate-500 text-xs sm:text-sm">{member.class_grade}</td>
                      <td className="px-5 sm:px-8 py-4 sm:py-5 text-right font-semibold text-slate-600 text-xs sm:text-sm">
                        {member.duty_count} <span className="text-slate-400 font-normal text-[10px] sm:text-xs">x</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}