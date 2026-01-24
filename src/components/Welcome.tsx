
import React, { useState, useEffect } from 'react';
import { 
    AppLogo, PlayIcon, StarIcon, MenuIcon, CheckIcon, ArrowRightIcon, 
    FacebookIcon, TwitterIcon, InstagramIcon, LinkedinIcon,
    ShieldIcon, SmartphoneIcon, ChartIcon, FileTextIcon, RobotIcon, UsersIcon,
    CheckCircleIcon
} from './Icons.tsx';
import { Button } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';

interface WelcomeProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onNavigate: (screen: 'privacy' | 'terms' | 'security') => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onGetStarted, onLogin, onNavigate }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Navbar scroll effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden animate-fade-in">
      
      {/* Navbar */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-lg shadow-sm py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <AppLogo className="w-9 h-9" />
                    <span className="text-xl font-bold tracking-tight text-slate-900">ContractorDocs</span>
                </div>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                    {['Features', 'Solutions', 'Pricing', 'Resources'].map((item) => (
                        <a key={item} href={`#${item.toLowerCase()}`} className="hover:text-primary transition-colors">{item}</a>
                    ))}
                </nav>

                {/* Desktop Buttons */}
                <div className="hidden md:flex items-center gap-4">
                    <button onClick={onLogin} className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors">Log in</button>
                    <Button onClick={onGetStarted} className="rounded-full px-6 py-2 text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all text-white bg-primary hover:bg-primary/90">
                        Get Started
                    </Button>
                </div>

                {/* Mobile Menu Toggle */}
                <button className="md:hidden p-2 text-slate-600" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                    <MenuIcon className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
            <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-100 p-4 shadow-xl flex flex-col gap-4 animate-in slide-in-from-top-5">
                {['Features', 'Solutions', 'Pricing'].map((item) => (
                    <a key={item} href="#" className="text-lg font-medium text-slate-600 py-2 border-b border-slate-50">{item}</a>
                ))}
                <div className="flex flex-col gap-3 mt-2">
                    <Button variant="outline" onClick={onLogin} className="w-full justify-center">Log in</Button>
                    <Button onClick={onGetStarted} className="w-full justify-center text-white bg-primary hover:bg-primary/90">Get Started</Button>
                </div>
            </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-10 lg:pt-36 lg:pb-20 overflow-hidden">
         {/* Background Gradients */}
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
             <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-[100px] mix-blend-multiply animate-pulse"></div>
             <div className="absolute top-40 right-10 w-72 h-72 bg-purple-400/20 rounded-full blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDelay: '1s' }}></div>
         </div>

         <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10 text-center">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider mb-8 shadow-sm hover:shadow-md transition-all cursor-default">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                v2.0 is live
             </div>
             
             <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-6 leading-[1.1]">
                 The Operating System for <br className="hidden lg:block" />
                 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">Modern Contractors</span>
             </h1>
             
             <p className="text-lg lg:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                 Stop wrestling with paperwork. Automate estimates, invoices, and daily reports so you can focus on the build, not the billing.
             </p>
             
             <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                 <Button onClick={onGetStarted} size="lg" className="h-14 px-8 text-lg rounded-full shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 border-0 text-white bg-primary hover:bg-primary/90">
                    Start Building Free
                    <ArrowRightIcon className="ml-2 w-5 h-5" />
                 </Button>
             </div>

             {/* 3D Dashboard Preview (CSS Mockup) */}
             <div className="relative max-w-5xl mx-auto perspective-1000">
                 <div className="relative rounded-xl bg-slate-950 p-3 shadow-2xl shadow-slate-500/20 transform rotate-x-12 hover:rotate-x-0 transition-transform duration-700 ease-out border border-slate-800/50">
                     <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50 blur-sm"></div>
                     
                     {/* Mock UI */}
                     <div className="rounded-lg bg-slate-900 w-full aspect-[16/10] overflow-hidden relative border border-slate-800 flex">
                        {/* Sidebar */}
                        <div className="w-16 lg:w-64 border-r border-slate-800 flex flex-col p-4 gap-4">
                           <div className="h-8 w-8 lg:w-32 bg-slate-800 rounded-md mb-4"></div>
                           <div className="h-4 w-12 lg:w-full bg-slate-800/50 rounded"></div>
                           <div className="h-4 w-12 lg:w-full bg-slate-800/50 rounded"></div>
                           <div className="h-4 w-12 lg:w-full bg-slate-800/50 rounded"></div>
                           <div className="mt-auto h-10 w-10 lg:w-full bg-blue-900/20 rounded-lg border border-blue-900/30"></div>
                        </div>
                        {/* Content */}
                        <div className="flex-1 flex flex-col">
                           {/* Header */}
                           <div className="h-16 border-b border-slate-800 flex items-center px-8 justify-between">
                              <div className="h-6 w-32 bg-slate-800 rounded"></div>
                              <div className="h-8 w-8 bg-slate-800 rounded-full"></div>
                           </div>
                           {/* Body */}
                           <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                               <div className="lg:col-span-2 h-48 bg-slate-800/30 rounded-xl border border-slate-800 p-4">
                                  <div className="flex items-end gap-2 h-full pb-2 pl-2">
                                     <div className="w-full bg-blue-500/20 rounded-t h-[40%]"></div>
                                     <div className="w-full bg-blue-500/40 rounded-t h-[70%]"></div>
                                     <div className="w-full bg-blue-500/60 rounded-t h-[50%]"></div>
                                     <div className="w-full bg-blue-500 rounded-t h-[85%] relative shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                     <div className="w-full bg-blue-500/30 rounded-t h-[60%]"></div>
                                  </div>
                                </div>
                               <div className="h-48 bg-slate-800/30 rounded-xl border border-slate-800 p-4 space-y-3">
                                  <div className="h-4 w-20 bg-slate-800 rounded"></div>
                                  <div className="h-8 w-32 bg-slate-800 rounded"></div>
                                  <div className="h-2 w-full bg-slate-800 rounded-full mt-4 overflow-hidden">
                                     <div className="h-full w-3/4 bg-green-500"></div>
                                  </div>
                               </div>
                               <div className="lg:col-span-3 h-32 bg-slate-800/20 rounded-xl border border-slate-800 p-4"></div>
                           </div>
                        </div>
                     </div>
                     
                     {/* Floating Badge 1 */}
                     <div className="absolute -right-4 top-1/4 bg-white p-4 rounded-xl shadow-xl border border-slate-100 animate-float hidden lg:block z-20">
                         <div className="flex items-center gap-3">
                             <div className="p-2 bg-green-100 rounded-lg text-green-600">
                                 <CheckCircleIcon className="w-6 h-6" />
                             </div>
                             <div>
                                 <p className="text-xs text-slate-500 font-bold uppercase">Invoice Paid</p>
                                 <p className="text-lg font-bold text-slate-900">$4,250.00</p>
                             </div>
                         </div>
                     </div>
                     
                     {/* Floating Badge 2 */}
                     <div className="absolute -left-8 bottom-1/4 bg-white p-4 rounded-xl shadow-xl border border-slate-100 animate-float hidden lg:block z-20" style={{ animationDelay: '1.5s' }}>
                         <div className="flex items-center gap-3">
                             <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                 <UsersIcon className="w-6 h-6" />
                             </div>
                             <div>
                                 <p className="text-xs text-slate-500 font-bold uppercase">New Client</p>
                                 <p className="text-lg font-bold text-slate-900">Smith Residence</p>
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
         </div>
      </section>

      {/* Bento Grid Features */}
      <section id="features" className="pt-10 pb-24 lg:pt-20 lg:pb-32">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
              <div className="mb-20 text-center max-w-3xl mx-auto">
                  <div className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 font-semibold text-sm rounded-full mb-6">
                      POWERFUL FEATURES
                  </div>
                  <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
                      More than just invoices.<br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">A complete toolkit.</span>
                  </h2>
                  <p className="text-lg text-slate-600 leading-relaxed">
                      Everything you need to manage your contracting business in one place. From the first estimate to the final warranty, we've got you covered.
                  </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                  {/* Feature 1 - Large */}
                  <div className="md:col-span-2 bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 rounded-3xl p-8 lg:p-10 shadow-sm border border-white/50 hover:shadow-md transition-shadow relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-white/40 rounded-full -translate-y-1/2 translate-x-1/3 group-hover:bg-white/60 transition-colors"></div>
                      <div className="relative z-10">
                          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 text-white shadow-lg shadow-blue-600/20">
                              <RobotIcon className="w-6 h-6" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900 mb-3">AI-Powered Automation</h3>
                          <p className="text-slate-600 max-w-md mb-8">Never type the same data twice. Our AI extracts details from your inputs to auto-generate contracts, invoices, and daily reports in seconds.</p>
                          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 inline-block">
                              <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  Auto-generated 3 documents from 1 voice note
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Feature 2 */}
                  <div className="bg-slate-900 rounded-3xl p-8 lg:p-10 shadow-sm border border-slate-800 text-white relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                      <div className="relative z-10 h-full flex flex-col">
                          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm">
                              <ShieldIcon className="w-6 h-6" />
                          </div>
                          <h3 className="text-2xl font-bold mb-3">Bank-Level Security</h3>
                          <p className="text-slate-400 mb-6 flex-grow">Your client data and financial records are encrypted with AES-256 bit standards.</p>
                          <div className="flex items-center gap-2 text-xs font-mono text-green-400 bg-green-400/10 py-1 px-3 rounded-full w-fit">
                              <CheckIcon className="w-3 h-3" /> Encrypted
                          </div>
                      </div>
                  </div>

                  {/* Feature 3 */}
                  <div className="bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 rounded-3xl p-8 lg:p-10 shadow-sm border border-white/50 hover:shadow-md transition-shadow">
                      <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-purple-600">
                          <SmartphoneIcon className="w-6 h-6" />
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-3">Mobile Command</h3>
                      <p className="text-slate-600">The full power of the desktop app, right in your pocket. Sign documents on glass.</p>
                  </div>

                  {/* Feature 4 - Large */}
                  <div className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 lg:p-10 shadow-xl shadow-blue-900/20 text-white relative overflow-hidden">
                      <div className="absolute right-0 bottom-0 opacity-10">
                           <ChartIcon className="w-64 h-64 -mb-10 -mr-10" />
                      </div>
                      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-8">
                          <div className="flex-1">
                              <h3 className="text-2xl font-bold mb-3">Real-Time Financial Analytics</h3>
                              <p className="text-blue-100 mb-6">Track every dollar. Know exactly which jobs are profitable and who still owes you money with our live dashboard.</p>
                              <Button onClick={onGetStarted} className="bg-white text-blue-700 hover:bg-blue-50 border-0 font-semibold">
                                  View Demo Dashboard
                              </Button>
                          </div>
                          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 w-full md:w-64">
                              <div className="flex justify-between text-sm mb-2">
                                  <span className="text-blue-200">Total Revenue</span>
                                  <span className="font-bold text-green-300">+12%</span>
                              </div>
                              <div className="text-3xl font-bold mb-4">$142,500</div>
                              <div className="h-12 flex items-end gap-1">
                                  {[40, 60, 45, 70, 50, 80, 65].map((h, i) => (
                                      <div key={i} className="flex-1 bg-blue-400/50 rounded-t-sm" style={{ height: `${h}%` }}></div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* Testimonial Grid */}
      <section className="py-24 bg-white border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
              <h2 className="text-3xl font-bold text-center mb-16">Built for the ones who build.</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                      { 
                          quote: "I used to spend my Sundays doing invoices. Now I do them in the truck before I even leave the job site.", 
                          author: "Mike R.", 
                          role: "General Contractor",
                          image: "https://images.contractordocs.app/profile-4.jpg" 
                      },
                      { 
                          quote: "The templates look so professional. My clients actually comment on how nice the estimates look.", 
                          author: "Steve J.", 
                          role: "Renovation Specialist",
                          image: "https://images.contractordocs.app/profile-2.jpg"
                      },
                      { 
                          quote: "Worth every penny. The daily reports feature alone has saved me from three potential disputes this year.", 
                          author: "David K.", 
                          role: "Site Foreman",
                          image: "https://images.contractordocs.app/profile-1.jpg"
                      }
                  ].map((t, i) => (
                      <div key={i} className="bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 p-8 rounded-2xl border border-white/50 shadow-lg relative hover:scale-[1.02] transition-transform duration-300">
                          <div className="flex gap-1 mb-4">
                              {[...Array(5)].map((_, j) => <StarIcon key={j} className="w-4 h-4 text-yellow-400 fill-current" />)}
                          </div>
                          <p className="text-blue-900/80 font-medium mb-6 relative z-10 leading-relaxed">{t.quote}</p>
                          <div className="flex items-center gap-3">
                              <img 
                                src={t.image} 
                                alt={t.author} 
                                className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" 
                              />
                              <div>
                                  <p className="text-sm font-bold text-blue-950">{t.author}</p>
                                  <p className="text-xs text-blue-700">{t.role}</p>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </section>

      {/* Big CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
          <div className="max-w-5xl mx-auto relative group perspective-1000">
              {/* Glow effect behind */}
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-[3rem] blur-2xl opacity-20 group-hover:opacity-30 transition duration-500"></div>
              
              <div className="relative rounded-[2.5rem] bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 p-12 lg:p-24 text-center overflow-hidden border border-white/50 shadow-2xl shadow-blue-900/10 transform transition-transform duration-500 hover:scale-[1.01]">
                  
                  {/* 3D Shapes / Background Decor */}
                  <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                      <div className="absolute -top-[10%] -right-[10%] w-[50%] h-[80%] bg-gradient-to-br from-white/40 to-transparent rounded-full blur-3xl transform rotate-12 mix-blend-overlay"></div>
                      <div className="absolute top-[20%] -left-[10%] w-[40%] h-[60%] bg-blue-400/10 rounded-full blur-3xl"></div>
                      {/* Subtle grid */}
                      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-color-burn"></div>
                  </div>

                  <div className="relative z-10 flex flex-col items-center">
                      
                      <h2 className="text-4xl lg:text-6xl font-bold text-blue-950 mb-6 tracking-tight drop-shadow-sm">
                          Ready to upgrade your workflow?
                      </h2>
                      <p className="text-xl text-blue-800/80 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
                          Join 15,000+ contractors who are saving time and winning more jobs with our professional tools.
                      </p>
                      <div className="flex flex-col sm:flex-row justify-center gap-4 w-full sm:w-auto">
                          <Button onClick={onGetStarted} size="lg" className="h-16 px-12 text-xl rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 border-0 shadow-xl shadow-blue-600/25 transform hover:scale-105 transition-all duration-300 ring-4 ring-white/20">
                              Start for Free
                          </Button>
                      </div>
                      <p className="mt-8 text-sm font-semibold text-blue-700/60 flex items-center gap-2">
                          <CheckCircleIcon className="w-4 h-4" /> No credit card required
                      </p>
                  </div>
              </div>
          </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 pt-16 pb-8">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
                  <div className="col-span-2 lg:col-span-2">
                      <div className="flex items-center gap-2 mb-4">
                          <AppLogo className="w-8 h-8" />
                          <span className="text-xl font-bold text-slate-900">ContractorDocs</span>
                      </div>
                      <p className="text-slate-500 text-sm max-w-xs mb-6">
                          The #1 paperwork automation tool built specifically for trade professionals.
                      </p>
                      <div className="flex gap-4">
                          {[TwitterIcon, FacebookIcon, InstagramIcon, LinkedinIcon].map((Icon, i) => (
                              <a key={i} href="#" className="text-slate-400 hover:text-primary transition-colors">
                                  <Icon className="w-5 h-5" />
                              </a>
                          ))}
                      </div>
                  </div>
                  
                  <div>
                      <h4 className="font-bold text-slate-900 mb-4">Product</h4>
                      <ul className="space-y-3 text-sm text-slate-600">
                          <li><button onClick={() => window.location.href = "#features"} className="hover:text-primary text-left">Features</button></li>
                          <li><button onClick={() => {}} className="hover:text-primary text-left">Templates</button></li>
                          <li><button onClick={() => {}} className="hover:text-primary text-left">Mobile App</button></li>
                          <li><button onClick={() => {}} className="hover:text-primary text-left">Pricing</button></li>
                      </ul>
                  </div>
                  <div>
                      <h4 className="font-bold text-slate-900 mb-4">Company</h4>
                      <ul className="space-y-3 text-sm text-slate-600">
                          <li><button onClick={() => {}} className="hover:text-primary text-left">About</button></li>
                          <li><button onClick={() => {}} className="hover:text-primary text-left">Careers</button></li>
                          <li><button onClick={() => {}} className="hover:text-primary text-left">Blog</button></li>
                          <li><button onClick={() => {}} className="hover:text-primary text-left">Contact</button></li>
                      </ul>
                  </div>
                   <div>
                      <h4 className="font-bold text-slate-900 mb-4">Legal</h4>
                      <ul className="space-y-3 text-sm text-slate-600">
                          <li><a href="https://policy.contractordocs.app/" className="hover:text-primary text-left block" target="_blank" rel="noopener noreferrer">Privacy</a></li>
                          <li><a href="https://terms.contractordocs.app/" className="hover:text-primary text-left block" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
                          <li><button onClick={() => onNavigate('security')} className="hover:text-primary text-left">Security</button></li>
                      </ul>
                  </div>
              </div>
              <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
                  <p>© 2024 ContractorDocs. All rights reserved.</p>
                  <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      All Systems Operational
                  </div>
              </div>
          </div>
      </footer>
    </div>
  );
};

export default Welcome;
    