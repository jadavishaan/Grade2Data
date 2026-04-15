import Scanner from './components/Scanner';

export default function App() {
  return (
    <div className="min-h-screen bg-[#FDFDFD] text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-50/50 blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] rounded-full bg-indigo-50/30 blur-[100px]" />
      </div>

      <main className="relative">
        <Scanner />
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-gray-100">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-gray-400">
          <p>© 2026 Grade2Data. Powered by Gemini AI.</p>
          <div className="flex items-center gap-8">
            <a href="#" className="hover:text-gray-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
