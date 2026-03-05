'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Shield: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  Palette: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5"/>
      <circle cx="17.5" cy="10.5" r=".5"/>
      <circle cx="8.5" cy="7.5" r=".5"/>
      <circle cx="6.5" cy="12.5" r=".5"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  ),
  Key: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/>
      <path d="m21 2-9.6 9.6"/>
      <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    </svg>
  ),
  Workflow: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1"/>
      <rect x="15" y="3" width="6" height="6" rx="1"/>
      <rect x="9" y="15" width="6" height="6" rx="1"/>
      <path d="M6 9v3a1 1 0 0 0 1 1h4"/>
      <path d="M18 9v3a1 1 0 0 1-1 1h-4"/>
    </svg>
  ),
  Globe: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  Zap: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Lock: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Play: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  FileText: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  Award: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  ),
  Smartphone: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  ),
  Users: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  PenTool: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19 7-7 3 3-7 7-3-3z"/>
      <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="m2 2 7.586 7.586"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
  ),
  Database: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  Building: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
      <path d="M9 22v-4h6v4"/>
      <path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/>
      <path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/>
      <path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>
    </svg>
  ),
  Fingerprint: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/>
      <path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/>
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/>
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/>
      <path d="M8.65 22c.21-.66.45-1.32.57-2"/>
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88"/>
      <path d="M2 16h.01"/>
      <path d="M21.8 16c.2-2 .131-5.354 0-6"/>
      <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/>
    </svg>
  ),
};

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

// ============================================================================
// COMPONENTS
// ============================================================================

const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'success' }> = ({
  children,
  variant = 'default'
}) => (
  <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium backdrop-blur-md border ${
    variant === 'success'
      ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
      : 'bg-white/10 border-white/20 text-white'
  }`}>
    {variant === 'success' && <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
    {children}
  </span>
);

const Button: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  href?: string;
}> = ({ children, variant = 'primary', size = 'md', className = '', href }) => {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all';
  const variants = {
    primary: 'bg-white text-violet-600 shadow-lg shadow-violet-900/20 hover:scale-105 hover:shadow-xl',
    secondary: 'bg-transparent border border-white/30 text-white hover:bg-white/10',
    ghost: 'text-white/80 hover:text-white hover:bg-white/5',
  };
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };
  const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={combinedClassName}>
        {children}
      </Link>
    );
  }
  return (
    <button className={combinedClassName}>
      {children}
    </button>
  );
};

const FeatureCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}> = ({ icon, title, description, color }) => (
  <motion.div
    variants={fadeInUp}
    className="group p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-xl"
  >
    <div className={`inline-flex p-3 rounded-xl ${color} mb-4`}>
      {icon}
    </div>
    <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
    <p className="text-violet-100/70 text-sm leading-relaxed">{description}</p>
  </motion.div>
);

const StatCard: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <motion.div
    variants={fadeInUp}
    className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 text-center"
  >
    <div className="text-3xl md:text-4xl font-black text-white mb-1">{value}</div>
    <div className="text-violet-200/70 text-sm">{label}</div>
  </motion.div>
);

const StepCard: React.FC<{ number: string; title: string; description: string }> = ({
  number, title, description
}) => (
  <motion.div
    variants={fadeInUp}
    className="relative p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10"
  >
    <div className="absolute -top-4 -left-2 w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
      {number}
    </div>
    <h3 className="text-lg font-bold text-white mb-2 mt-2">{title}</h3>
    <p className="text-violet-100/70 text-sm leading-relaxed">{description}</p>
  </motion.div>
);

const FAQItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <div className="border-b border-white/10 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-5 flex items-center justify-between text-left hover:text-violet-200 transition-colors"
      >
        <span className="text-white font-medium pr-4">{question}</span>
        <span className={`text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <Icons.ChevronDown />
        </span>
      </button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="pb-5 text-violet-100/70 text-sm leading-relaxed"
        >
          {answer}
        </motion.div>
      )}
    </div>
  );
};

// ============================================================================
// DASHBOARD PREVIEW COMPONENT
// ============================================================================
const DashboardPreview: React.FC = () => {
  const sidebarItems = [
    { icon: '🎨', label: 'Designer', active: true },
    { icon: '📋', label: 'Schemas', active: false },
    { icon: '🔗', label: 'Connections', active: false },
    { icon: '🏅', label: 'Credentials', active: false },
    { icon: '⚡', label: 'Workflows', active: false },
  ];

  const credentials = [
    { title: 'Digital ID Card', status: 'Active', color: 'from-violet-500 to-purple-500' },
    { title: 'Employment Badge', status: 'Issued', color: 'from-fuchsia-500 to-pink-500' },
    { title: 'Course Certificate', status: 'Draft', color: 'from-indigo-500 to-blue-500' },
  ];

  return (
    <div className="relative">
      {/* Glow effect */}
      <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/30 via-purple-500/30 to-fuchsia-500/30 blur-3xl rounded-3xl" />

      {/* Browser window */}
      <div className="relative bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
        {/* Browser header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-400 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              essi.ajna.inc/credential-designer
            </div>
          </div>
        </div>

        {/* Dashboard content */}
        <div className="flex h-[340px]">
          {/* Sidebar */}
          <div className="w-14 bg-slate-800/50 border-r border-white/5 py-3 flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold mb-3">
              E
            </div>
            {sidebarItems.map((item, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-all ${
                  item.active
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-300'
                }`}
              >
                {item.icon}
              </div>
            ))}
          </div>

          {/* Main content - Credential Designer Preview */}
          <div className="flex-1 p-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold text-sm">Credential Designer</h3>
                <p className="text-slate-500 text-xs">Design verifiable credentials visually</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-violet-500/20 text-violet-400 text-xs rounded-full">
                  Save Draft
                </div>
              </div>
            </div>

            {/* Designer Canvas */}
            <div className="grid grid-cols-3 gap-3">
              {/* Canvas area */}
              <div className="col-span-2 bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg p-4 h-44 relative overflow-hidden">
                  <div className="absolute top-2 right-2 w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">🏢</span>
                  </div>
                  <div className="mt-auto absolute bottom-4 left-4">
                    <div className="text-white/60 text-[10px] uppercase tracking-wider mb-1">Employee ID</div>
                    <div className="text-white font-bold text-sm">John Doe</div>
                    <div className="text-white/80 text-xs">Software Engineer</div>
                  </div>
                  <div className="absolute bottom-4 right-4 w-16 h-16 bg-white/10 rounded-lg flex items-center justify-center">
                    <div className="grid grid-cols-4 gap-0.5">
                      {[...Array(16)].map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 ${i % 3 === 0 ? 'bg-white' : 'bg-white/30'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Properties panel */}
              <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <div className="text-white text-xs font-medium mb-3">Properties</div>
                <div className="space-y-2">
                  <div>
                    <div className="text-slate-500 text-[10px] mb-1">Background</div>
                    <div className="flex gap-1">
                      {['bg-violet-500', 'bg-purple-500', 'bg-indigo-500', 'bg-fuchsia-500'].map((c, i) => (
                        <div key={i} className={`w-5 h-5 rounded ${c} cursor-pointer ${i === 0 ? 'ring-2 ring-white' : ''}`} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] mb-1">Font Size</div>
                    <div className="bg-slate-700/50 rounded px-2 py-1 text-white text-xs">14px</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Credentials list */}
            <div className="mt-3 bg-slate-800/50 rounded-xl p-3 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-xs font-medium">Recent Credentials</span>
                <span className="text-violet-400 text-[10px] cursor-pointer">View all</span>
              </div>
              <div className="space-y-1.5">
                {credentials.map((cred, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${cred.color} flex items-center justify-center`}>
                      <span className="text-white text-[10px]">🎫</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-[10px] truncate">{cred.title}</div>
                      <div className="text-slate-500 text-[9px]">{cred.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN INTERFACE
// ============================================================================

export const Interface: React.FC = () => {
  return (
    <div className="flex flex-col w-full">

      {/* ================================================================== */}
      {/* NAVBAR */}
      {/* ================================================================== */}
      <nav className="fixed top-0 left-0 w-full p-4 md:p-6 flex justify-between items-center z-50 pointer-events-auto bg-gradient-to-b from-black/30 to-transparent backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
            A
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Apostille</span>
        </div>
        <div className="hidden lg:flex items-center gap-8 text-sm font-medium text-white/80">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#use-cases" className="hover:text-white transition-colors">Use Cases</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="hidden md:flex" href="/login">Sign In</Button>
          <Button variant="primary" size="sm" href="/signup">Get Started</Button>
        </div>
      </nav>

      {/* ================================================================== */}
      {/* HERO SECTION */}
      {/* ================================================================== */}
      <section className="min-h-screen flex items-center pt-20 pb-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="pointer-events-auto"
            >
              <motion.div variants={fadeInUp}>
                <Badge variant="success">Now Available</Badge>
              </motion.div>

              <motion.h1
                variants={fadeInUp}
                className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] mt-6 mb-6"
              >
                The Complete
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300">
                  Credentials Platform
                </span>
              </motion.h1>

              <motion.p
                variants={fadeInUp}
                className="text-lg md:text-xl text-violet-100/80 mb-8 max-w-xl leading-relaxed"
              >
                Design, issue, and verify digital credentials with our visual designer.
                Support for W3C VCs, OpenBadges, mDL, OID4VC, and more.
              </motion.p>

              <motion.div variants={fadeInUp} className="flex flex-wrap gap-4 mb-10">
                <Button variant="primary" size="lg" href="/signup">
                  Start Building
                  <Icons.ArrowRight />
                </Button>
                <Button variant="secondary" size="lg" href="/login">
                  <Icons.Play />
                  View Demo
                </Button>
              </motion.div>

              {/* Trust Indicators */}
              <motion.div
                variants={fadeInUp}
                className="flex flex-wrap items-center gap-6 text-sm text-white/60"
              >
                <div className="flex items-center gap-2">
                  <Icons.Check />
                  <span>W3C Standards</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icons.Check />
                  <span>Privacy-First</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icons.Check />
                  <span>Open Source</span>
                </div>
              </motion.div>
            </motion.div>

            {/* Right - Platform Preview */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="hidden lg:block pointer-events-auto"
            >
              <DashboardPreview />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* STATS BAR */}
      {/* ================================================================== */}
      <section className="py-12 px-6 md:px-12 border-y border-white/10 bg-white/5 backdrop-blur-sm">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-6xl mx-auto pointer-events-auto"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatCard value="10+" label="Credential Types" />
            <StatCard value="5+" label="DID Methods" />
            <StatCard value="100%" label="W3C Compliant" />
            <StatCard value="24/7" label="Verification" />
          </div>
        </motion.div>
      </section>

      {/* ================================================================== */}
      {/* PLATFORM CAPABILITIES */}
      {/* ================================================================== */}
      <section id="features" className="py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto pointer-events-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp}>
              <Badge>Platform Features</Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4"
            >
              Everything for<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-fuchsia-400">
                Verifiable Credentials
              </span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-violet-100/70 text-lg max-w-2xl mx-auto">
              A complete platform for designing, issuing, and verifying digital credentials
              using open standards.
            </motion.p>
          </motion.div>

          {/* Feature Grid */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <FeatureCard
              icon={<Icons.Palette />}
              title="Visual Credential Designer"
              description="Drag-and-drop interface for designing credential cards. Add logos, backgrounds, attributes, and branding with ease."
              color="bg-violet-500/20 text-violet-300"
            />
            <FeatureCard
              icon={<Icons.Key />}
              title="Multi-DID Support"
              description="Create and manage DIDs across multiple methods: cheqd, did:web, did:key, and more. Full key management built-in."
              color="bg-purple-500/20 text-purple-300"
            />
            <FeatureCard
              icon={<Icons.FileText />}
              title="OID4VCI Issuance"
              description="OpenID for Verifiable Credential Issuance. Generate QR codes and deep links for credential offers."
              color="bg-fuchsia-500/20 text-fuchsia-300"
            />
            <FeatureCard
              icon={<Icons.Shield />}
              title="OID4VP Verification"
              description="Request and verify presentations using OpenID for Verifiable Presentations protocol."
              color="bg-pink-500/20 text-pink-300"
            />
            <FeatureCard
              icon={<Icons.Smartphone />}
              title="mDL / mdoc Support"
              description="Issue ISO 18013-5 mobile driver's licenses and other mdoc credentials for government use cases."
              color="bg-rose-500/20 text-rose-300"
            />
            <FeatureCard
              icon={<Icons.Award />}
              title="OpenBadges 3.0"
              description="Create and issue Open Badges that are compatible with Credly, Canvas, and other badge platforms."
              color="bg-orange-500/20 text-orange-300"
            />
            <FeatureCard
              icon={<Icons.Workflow />}
              title="Workflow Engine"
              description="Visual workflow builder for credential issuance pipelines. Automate verification and issuance flows."
              color="bg-amber-500/20 text-amber-300"
            />
            <FeatureCard
              icon={<Icons.Users />}
              title="Group Messaging"
              description="Secure group communication using MLS protocol. Perfect for organizational credential management."
              color="bg-lime-500/20 text-lime-300"
            />
            <FeatureCard
              icon={<Icons.PenTool />}
              title="Digital Signing"
              description="Sign documents and data with verifiable credentials. Full audit trail and timestamping."
              color="bg-emerald-500/20 text-emerald-300"
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* HOW IT WORKS */}
      {/* ================================================================== */}
      <section id="how-it-works" className="py-24 px-6 md:px-12 bg-white/5">
        <div className="max-w-6xl mx-auto pointer-events-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp}>
              <Badge>How It Works</Badge>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Issue Credentials in Minutes
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-violet-100/70 text-lg max-w-2xl mx-auto">
              From setup to your first verifiable credential in four simple steps.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            <StepCard
              number="1"
              title="Create Your DID"
              description="Set up your decentralized identifier. Choose from cheqd, did:web, or did:key methods."
            />
            <StepCard
              number="2"
              title="Design Your Credential"
              description="Use our visual designer to create beautiful credential cards with your branding."
            />
            <StepCard
              number="3"
              title="Define the Schema"
              description="Specify the attributes and data types for your credential using standard schemas."
            />
            <StepCard
              number="4"
              title="Issue & Verify"
              description="Generate credential offers via OID4VCI and verify presentations with OID4VP."
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* USE CASES */}
      {/* ================================================================== */}
      <section id="use-cases" className="py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto pointer-events-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp}>
              <Badge>Use Cases</Badge>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Built for Every Industry
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8"
          >
            {/* Government */}
            <motion.div variants={fadeInUp} className="p-8 rounded-3xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-white/10">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-violet-500/20 rounded-xl text-violet-300">
                  <Icons.Building />
                </div>
                <h3 className="text-2xl font-bold text-white">Government & Identity</h3>
              </div>
              <p className="text-violet-100/70 mb-6">
                Issue digital IDs, driver's licenses, and government credentials using
                ISO-compliant mDL and mdoc formats.
              </p>
              <ul className="space-y-3">
                {['Mobile Driver\'s Licenses', 'National ID Cards', 'Residency Permits', 'Voter Credentials'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <span className="text-emerald-400"><Icons.Check /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Education */}
            <motion.div variants={fadeInUp} className="p-8 rounded-3xl bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10 border border-white/10">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-fuchsia-500/20 rounded-xl text-fuchsia-300">
                  <Icons.Award />
                </div>
                <h3 className="text-2xl font-bold text-white">Education & Training</h3>
              </div>
              <p className="text-violet-100/70 mb-6">
                Issue degrees, certificates, and micro-credentials as verifiable credentials
                or Open Badges.
              </p>
              <ul className="space-y-3">
                {['University Degrees', 'Course Certificates', 'Skill Badges', 'Professional Licenses'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <span className="text-emerald-400"><Icons.Check /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Enterprise */}
            <motion.div variants={fadeInUp} className="p-8 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-white/10">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-300">
                  <Icons.Fingerprint />
                </div>
                <h3 className="text-2xl font-bold text-white">Enterprise & HR</h3>
              </div>
              <p className="text-violet-100/70 mb-6">
                Streamline employee onboarding, access management, and compliance
                with verifiable employment credentials.
              </p>
              <ul className="space-y-3">
                {['Employee IDs', 'Access Badges', 'Compliance Certs', 'Training Records'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <span className="text-emerald-400"><Icons.Check /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Healthcare */}
            <motion.div variants={fadeInUp} className="p-8 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-white/10">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-300">
                  <Icons.Shield />
                </div>
                <h3 className="text-2xl font-bold text-white">Healthcare</h3>
              </div>
              <p className="text-violet-100/70 mb-6">
                Issue verifiable health credentials, professional licenses, and
                patient records with privacy controls.
              </p>
              <ul className="space-y-3">
                {['Medical Licenses', 'Vaccination Records', 'Insurance Cards', 'Patient IDs'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <span className="text-emerald-400"><Icons.Check /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* TECH STACK */}
      {/* ================================================================== */}
      <section className="py-24 px-6 md:px-12 bg-white/5">
        <div className="max-w-6xl mx-auto pointer-events-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp}>
              <Badge>Technology</Badge>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Built on Open Standards
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-violet-100/70 text-lg max-w-2xl mx-auto">
              Enterprise-grade infrastructure using W3C, IETF, and ISO standards.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            {[
              { title: 'W3C VC', subtitle: 'Verifiable Credentials' },
              { title: 'OID4VC', subtitle: 'OpenID Connect' },
              { title: 'DIDComm', subtitle: 'Secure Messaging' },
              { title: 'ISO 18013', subtitle: 'mDL Standard' },
            ].map((tech, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10 text-center"
              >
                <div className="text-2xl font-bold text-white mb-1">{tech.title}</div>
                <div className="text-violet-200/60 text-xs uppercase tracking-wider">{tech.subtitle}</div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-3 gap-4"
          >
            {[
              { title: 'Credo-ts', subtitle: 'SSI Framework' },
              { title: 'PostgreSQL + Askar', subtitle: 'Secure Storage' },
              { title: 'WebSocket', subtitle: 'Real-time Updates' },
            ].map((tech, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 text-center"
              >
                <div className="text-lg font-semibold text-white">{tech.title}</div>
                <div className="text-violet-200/60 text-sm">{tech.subtitle}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FAQ */}
      {/* ================================================================== */}
      <section id="faq" className="py-24 px-6 md:px-12">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp}>
              <Badge>FAQ</Badge>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Frequently Asked Questions
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 md:p-8"
          >
            <FAQItem
              question="What is a Verifiable Credential?"
              answer="A Verifiable Credential (VC) is a digital credential that is cryptographically signed by the issuer. Unlike PDF certificates, VCs can be instantly verified without contacting the issuing organization. Users store them in a digital wallet and own them forever."
            />
            <FAQItem
              question="What credential formats does Apostille support?"
              answer="Apostille supports W3C Verifiable Credentials (JSON-LD and JWT), OpenBadges 3.0, ISO 18013-5 mDL (mobile driver's license), and AnonCreds for privacy-preserving credentials."
            />
            <FAQItem
              question="What is OID4VCI and OID4VP?"
              answer="OID4VCI (OpenID for Verifiable Credential Issuance) and OID4VP (OpenID for Verifiable Presentations) are open standards that enable interoperable credential issuance and verification across different platforms and wallets."
            />
            <FAQItem
              question="Can I customize the credential design?"
              answer="Yes! Our visual credential designer lets you create custom credential cards with your branding, logos, colors, and layout. You can add text, images, and dynamic attribute placeholders that get filled when credentials are issued."
            />
            <FAQItem
              question="Is my data secure?"
              answer="Absolutely. We use PostgreSQL with Askar wallet storage for encrypted key management. All communications use TLS encryption, and DIDComm messaging for peer-to-peer credential exchange is end-to-end encrypted."
            />
            <FAQItem
              question="Can credentials be revoked?"
              answer="Yes, Apostille supports credential revocation. When a credential is revoked, verifiers will see the revocation status when checking the credential. We support multiple revocation methods including status lists and revocation registries."
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* CTA */}
      {/* ================================================================== */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="bg-gradient-to-br from-violet-500/20 via-purple-500/20 to-fuchsia-500/20 backdrop-blur-xl border border-white/20 p-12 md:p-16 rounded-3xl text-center shadow-2xl"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Ready to Issue Your First Credential?
            </h2>
            <p className="text-violet-100/80 text-lg mb-8 max-w-2xl mx-auto">
              Join organizations using Apostille to issue verifiable credentials,
              streamline verification, and empower users with self-sovereign identity.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button variant="primary" size="lg" href="/signup">
                Get Started Free
                <Icons.ArrowRight />
              </Button>
              <Button variant="secondary" size="lg" href="/login">
                View Documentation
              </Button>
            </div>
            <p className="text-white/50 text-sm mt-6">
              No credit card required
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FOOTER */}
      {/* ================================================================== */}
      <footer className="py-12 px-6 md:px-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto pointer-events-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
                  A
                </div>
                <span className="text-xl font-bold text-white">Apostille</span>
              </div>
              <p className="text-white/60 text-sm">
                The complete platform for verifiable credentials.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-white/60 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#use-cases" className="hover:text-white transition-colors">Use Cases</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Demo</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-white/60 text-sm">
                <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
                <li><Link href="/signup" className="hover:text-white transition-colors">Get Started</Link></li>
                <li><Link href="/dashboard/credential-designer" className="hover:text-white transition-colors">Designer</Link></li>
                <li><Link href="/dashboard/credentials" className="hover:text-white transition-colors">Credentials</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-white/60 text-sm">
                <li><Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
                <li><a href="mailto:support@ajna.inc" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/40 text-sm">
              &copy; {new Date().getFullYear()} Ajna Inc. All rights reserved.
            </p>
            <p className="text-white/40 text-sm">
              essi.ajna.inc - Verifiable credentials made simple
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default Interface;
