import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// --- Interfaces ---
interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

interface JobResult {
  id: number;
  title: string;
  company: string;
  location: string;
  description: string;
  matchReason: string;
  salary?: string;
  benefits?: string;
  requirements?: string;
  postedDate?: string;
  applicationLink?: string;
  savedAt?: number;
}

// --- Constants ---
const ITEMS_PER_PAGE = 5;

const LOADING_MESSAGES = [
  // The Office
  "Convertendo salário para Schrute Bucks...",
  "O Comitê de Planejamento de Festas está avaliando seu perfil...",
  "Identidade roubada não é piada, Jim! Verificando dados...",
  "Colocando seu currículo na gelatina para segurança...",
  "Dunder Mifflin, aqui é o suporte... aguarde...",
  "Consultando o blog do Creed Bratton na dark web...",
  "Declarando FALÊNCIA... ops, buscando vagas...",
  "Assistant to the Regional Manager validando a busca...",
  "Parkour! Saltando de site em site...",
  "Stanley aprovou esta busca (ele nem olhou)...",
  "Isso é o que ela disse! (A recrutadora)...",
  "Verificando se a vaga exige sobreviver na fazenda Schrute...",
  // Brooklyn Nine-Nine
  "O Capitão Holt está analisando sua produtividade...",
  "Terry ama vagas de emprego (e iogurte)...",
  "Gritando 'NINE-NINE!' para acelerar o Wi-Fi...",
  "Cool, cool, cool, cool, cool... processando...",
  "Título da sua fita de entrevista de emprego...",
  "Boyle está super empolgado com essa oportunidade...",
  "Scully e Hitchcock estão comendo, a IA assumiu...",
  "Gina Linetti aprova essa pesquisa (ela é o momento)...",
  "Procurando o Pontiac Bandit nos sites de emprego...",
  "Iniciando o Assalto de Halloween em busca da vaga perfeita...",
  "Cheddar, o cachorro, está farejando as melhores ofertas...",
  "Verificando antecedentes criminais... brincadeira (ou não)..."
];

const HERO_QUOTES = [
  "\"Eu sabia exatamente o que fazer. Mas de uma forma muito mais real, eu não tinha ideia do que fazer.\" — Michael Scott",
  "\"Trabalho duro? Eu vejo pessoas fazendo isso o tempo todo. Parece cansativo.\" — Gina Linetti",
  "\"Bears. Beets. Battlestar Galactica. Buscas de Emprego.\" — Jim Halpert (imitando Dwight)",
  "\"Cool, cool, cool, cool, cool. Sem dúvida, sem dúvida.\" — Jake Peralta",
  "\"Eu sou Beyoncé, sempre.\" — Michael Scott",
  "\"Toda vez que alguém diz que eu não consigo, eu faço.\" — Terry Jeffords",
  "\"Você perde 100% das vagas para as quais não se candidata. - Wayne Gretzky\" — Michael Scott",
  "\"A vaga perfeita existe. NINE-NINE!\" — Jake Peralta",
  "\"Às vezes eu começo uma frase e nem sei onde ela vai dar. Eu só espero encontrar o caminho no meio dela.\" — Michael Scott",
  "\"Eu sou detetive/gênio/humano incrível.\" — Jake Peralta"
];

// --- Helpers ---

// Helper to normalize URLs and prevent "about:blank#blocked"
const normalizeUrl = (url?: string) => {
  if (!url || typeof url !== 'string') return null;
  let cleanUrl = url.trim();
  // Filter out common invalid placeholder texts
  if (cleanUrl.match(/^(não|none|null|undefined|n\/a|indispon|verifique)/i)) return null;
  
  // Ensure protocol
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return `https://${cleanUrl}`;
  }
  return cleanUrl;
};

// Helper to get semantic icons for benefits
const getBenefitIcon = (benefitText: string) => {
    const text = benefitText.toLowerCase();
    
    // Health / Medical
    if (text.match(/(saúde|médic|health|clínic|hospital)/)) {
        return (
            <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
        );
    }
    // Dental
    if (text.match(/(odont|dent|sorris)/)) {
        return (
            <svg className="w-3.5 h-3.5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        );
    }
    // Food / Meal
    if (text.match(/(refeição|aliment|food|vale|vr|va)/)) {
        return (
            <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
        );
    }
    // Transport / Fuel
    if (text.match(/(transporte|combustível|vt|fretado|estacionamento)/)) {
        return (
            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
        );
    }
    // Gym / Sports
    if (text.match(/(gym|academia|esporte|físic)/)) {
        return (
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        );
    }
    // Remote / Home Office
    if (text.match(/(remoto|home|casa|híbrido)/)) {
         return (
            <svg className="w-3.5 h-3.5 text-blue-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        );
    }
    // Education
    if (text.match(/(educação|curso|ensino|aprendizado|universidade|auxílio)/)) {
         return (
            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"></path><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path></svg>
        );
    }

    // Default check
    return <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>;
};

// --- Sub-Components ---

const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-2 align-middle">
    <svg className="w-4 h-4 text-stone-400 cursor-help hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-blue-900 text-white text-[10px] rounded-sm shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-sans normal-case tracking-normal leading-tight border border-blue-700">
      {text}
      <div className="absolute top-100 left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-blue-900"></div>
    </div>
  </div>
);

// JobCard Component
const JobCard = ({ job, isSaved, isExpanded, onToggleSave, onToggleExpand }: { 
    job: JobResult, 
    isSaved: boolean, 
    isExpanded: boolean, 
    onToggleSave: (e: React.MouseEvent, job: JobResult) => void,
    onToggleExpand: (id: number) => void 
}) => {
    const hasSalary = job.salary && job.salary !== "A combinar" && job.salary !== "Não informado";
    const [showCopied, setShowCopied] = useState(false);
    
    const appLink = normalizeUrl(job.applicationLink);
    const googleFallbackLink = `https://www.google.com/search?q=vaga+${encodeURIComponent(job.title)}+${encodeURIComponent(job.company)}+${encodeURIComponent(job.location)}`;
    
    const primaryLink = appLink || googleFallbackLink;

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(primaryLink);
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    return (
      <div 
        onClick={() => onToggleExpand(job.id)}
        className={`bg-white rounded-[2px] folder-tab transition-all duration-300 relative overflow-visible group cursor-pointer border-l border-r border-b border-stone-300
          ${isExpanded 
            ? 'shadow-xl shadow-stone-300/40 transform scale-[1.01] z-10' 
            : 'shadow-sm hover:shadow-lg hover:shadow-stone-300/20'
          }
        `}
      >
        <div className="p-6">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 space-y-3">
               {/* Badges Row - Dunder Mifflin Style Labels */}
               <div className="flex items-center gap-2 flex-wrap">
                 {job.postedDate && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-none text-[10px] font-typewriter font-bold uppercase tracking-wide bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
                      CONFIDENCIAL
                      <span className="ml-2 opacity-60">| {job.postedDate}</span>
                    </span>
                 )}
                 {hasSalary && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-none text-[10px] font-typewriter font-bold uppercase tracking-wide bg-green-50 text-green-700 border border-green-200">
                       <svg className="w-3 h-3 mr-1.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                       {job.salary}
                    </span>
                 )}
               </div>

               <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-800 transition-colors leading-tight font-sans">
                {job.title}
              </h3>
              
              <div className="flex items-center gap-2 text-sm text-gray-600 font-medium flex-wrap">
                <span className="flex items-center gap-1.5 text-gray-700 bg-stone-100 px-2 py-1 rounded-sm border border-stone-300 font-typewriter text-xs">
                  <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                  {job.company}
                </span>
                <span className="flex items-center gap-1.5 text-gray-500 font-typewriter text-xs">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  {job.location}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={handleShare}
                    className={`p-3 rounded-full transition-all duration-200 group/btn border ${
                        showCopied
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-white border-stone-200 text-stone-400 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50'
                    }`}
                    title="Compartilhar vaga"
                >
                    {showCopied ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    ) : (
                        <svg className="w-6 h-6 transition-transform group-hover/btn:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                    )}
                </button>

                <button 
                  onClick={(e) => onToggleSave(e, job)}
                  className={`p-3 rounded-full transition-all duration-200 group/btn border ${
                      isSaved 
                      ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-inner' 
                      : 'bg-white border-stone-200 text-stone-400 hover:border-amber-300 hover:text-amber-500 hover:bg-amber-50'
                  }`}
                  title={isSaved ? "Remover dos salvos" : "Salvar vaga"}
                >
                  <svg className={`w-6 h-6 transition-transform ${isSaved ? 'fill-current' : 'fill-none group-hover/btn:scale-110'}`} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                  </svg>
                </button>
            </div>
          </div>

          <div className="mt-5">
              <p className="text-gray-600 text-sm leading-relaxed line-clamp-2 font-serif">
                {job.description}
              </p>
          </div>

          {job.matchReason && (
            <div className="mt-4 flex items-start gap-2.5 bg-blue-50/80 p-3.5 border border-blue-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-blue-100 rounded-bl-xl z-0"></div>
                <div className="mt-0.5 bg-white p-1 rounded-full shadow-sm border border-blue-100 relative z-10">
                  <svg className="w-3 h-3 text-blue-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <p className="text-xs text-blue-900 leading-relaxed font-medium font-typewriter relative z-10">
                    <span className="block font-bold text-blue-800 mb-0.5 uppercase tracking-wider">Análise de Compatibilidade:</span>
                    {job.matchReason}
                </p>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        <div className={`bg-stone-50 border-t border-stone-200 overflow-hidden transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="bg-white p-5 shadow-sm border border-stone-200 relative">
                  <div className="absolute top-2 right-2 text-stone-200">
                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                  </div>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 block font-typewriter">Salário Estimado</span>
                  <div className="font-bold text-gray-800 text-lg flex items-center gap-2">
                     {job.salary || "A combinar / Não informado"}
                  </div>
               </div>
               
               <div className="bg-white p-5 shadow-sm border border-stone-200 relative">
                  <div className="absolute top-2 right-2 text-stone-200">
                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 block font-typewriter">Benefícios</span>
                  {job.benefits ? (
                     <div className="flex flex-wrap gap-2">
                       {job.benefits.split(/[,;]\s*/).map((b: string, i: number) => {
                          const cleanBenefit = b.trim().replace(/\.$/, '');
                          if (!cleanBenefit) return null;
                          return (
                            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold bg-blue-50 text-blue-800 border border-blue-100 font-typewriter">
                              {getBenefitIcon(cleanBenefit)}
                              {cleanBenefit}
                            </span>
                          );
                       })}
                     </div>
                  ) : (
                    <span className="text-sm text-stone-400 italic">Não especificados na vaga.</span>
                  )}
               </div>
            </div>
            
            {/* New Requirements Section */}
            <div className="bg-white p-5 shadow-sm border border-stone-200">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 block font-typewriter">Requisitos Adicionais</span>
                {job.requirements ? (
                    <div className="flex flex-wrap gap-2">
                    {job.requirements.split(/[,;]\s*/).map((r: string, i: number) => {
                        const cleanReq = r.trim().replace(/\.$/, '');
                        if (!cleanReq) return null;
                        return (
                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold bg-stone-100 text-stone-600 border border-stone-200 font-typewriter">
                            <svg className="w-3 h-3 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            {cleanReq}
                        </span>
                        );
                    })}
                    </div>
                ) : (
                <span className="text-sm text-stone-400 italic">Requisitos detalhados não informados.</span>
                )}
            </div>

            <div>
               <h4 className="text-sm font-bold text-gray-800 mb-3 ml-1 font-typewriter uppercase">Relatório Completo</h4>
               <div className="text-gray-600 text-sm leading-loose bg-white p-5 border border-stone-200 shadow-sm font-serif">
                  {job.description}
               </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-3 pt-2">
                <a 
                    href={primaryLink}
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-4 px-6 rounded-sm font-bold transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 flex justify-center items-center gap-2 transform hover:-translate-y-0.5 border-b-4 border-blue-950 active:border-b-0 active:translate-y-0.5 font-typewriter uppercase tracking-widest"
                >
                    {appLink ? "Candidatar-se" : "Investigar no Google"}
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                </a>

                {/* Backup Button if primary link fails */}
                {appLink && (
                    <a 
                        href={googleFallbackLink}
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0 bg-white border border-stone-200 hover:border-blue-300 hover:bg-blue-50 text-stone-600 hover:text-blue-800 py-4 px-6 rounded-sm font-bold transition-all flex justify-center items-center gap-2 font-typewriter"
                        title="Caso o link principal não funcione"
                    >
                        <span className="hidden md:inline">Link Quebrado?</span>
                        <span className="md:hidden">Erro?</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </a>
                )}
            </div>
          </div>
        </div>
      </div>
    );
};

// --- Main Application Component ---
const App = () => {
  // --- CHECK FOR API KEY ---
  const apiKey = process.env.API_KEY;
  const isApiKeyMissing = !apiKey || apiKey === "";

  // Initial states
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [requirements, setRequirements] = useState('');
  const [dateRange, setDateRange] = useState('7d');
  
  // New Filter States
  const [workModel, setWorkModel] = useState('any'); // any, Remoto, Híbrido, Presencial
  const [contractType, setContractType] = useState('any'); // any, CLT, PJ, Estágio
  const [experienceLevel, setExperienceLevel] = useState('any'); // Changed to time-based values

  const [isLoading, setIsLoading] = useState(false);
  
  // Loading Animation States
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0); 
  const [searchProgress, setSearchProgress] = useState(0); 
  const [msgOpacity, setMsgOpacity] = useState(1); // For text fade transition
  const [heroQuote, setHeroQuote] = useState(HERO_QUOTES[0]); // Dynamic quote

  const [hasSearched, setHasSearched] = useState(false); // Track if a search happened
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  
  // Location Autocomplete State
  const [allLocations, setAllLocations] = useState<string[]>([]);
  const [isLocationsLoading, setIsLocationsLoading] = useState(true);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1); // Keyboard navigation index
  const locationWrapperRef = useRef<HTMLDivElement>(null);
  const suggestionsListRef = useRef<HTMLUListElement>(null); // Ref for scroll management

  // Search Results
  const [results, setResults] = useState<JobResult[]>([]);
  const [groundingLinks, setGroundingLinks] = useState<GroundingChunk[]>([]);
  const [rawText, setRawText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Interaction State
  const [savedJobs, setSavedJobs] = useState<JobResult[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

  // Initial Load: Saved Jobs, IBGE Locations, Random Quote
  useEffect(() => {
    // 0. Set Random Quote
    setHeroQuote(HERO_QUOTES[Math.floor(Math.random() * HERO_QUOTES.length)]);

    // 1. Load Saved Jobs
    const storedJobs = localStorage.getItem('vagasRioSavedJobs');
    if (storedJobs) {
      try {
        setSavedJobs(JSON.parse(storedJobs));
      } catch (e) {
        console.error("Erro ao carregar histórico", e);
      }
    }

    // 2. Click outside listener
    const handleClickOutside = (event: MouseEvent) => {
      if (locationWrapperRef.current && !locationWrapperRef.current.contains(event.target as Node)) {
        setShowLocationSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    // 3. Fetch IBGE Data for all Brazilian Municipalities
    const fetchLocations = async () => {
        try {
            setIsLocationsLoading(true);
            const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
            const data = await response.json();
            
            // Format: "Nome da Cidade, UF"
            // Robust mapping with safety checks for nested properties
            const cities = data
                .map((city: any) => {
                    // Safety check: some entries might miss microrregiao or UF data
                    const uf = city?.microrregiao?.mesorregiao?.UF?.sigla;
                    if (!uf) return null;
                    return `${city.nome}, ${uf}`;
                })
                .filter((city: string | null) => city !== null);
            
            // Add priority options and sort cities
            const sortedCities = cities.sort((a: string, b: string) => a.localeCompare(b));
            setAllLocations(["Remoto", "Híbrido", ...sortedCities]);
        } catch (err) {
            console.error("Erro ao buscar cidades do IBGE", err);
            // Fallback simplistic list in case API fails
            setAllLocations(["Remoto", "Híbrido", "São Paulo, SP", "Rio de Janeiro, RJ", "Belo Horizonte, MG", "Brasília, DF"]); 
        } finally {
            setIsLocationsLoading(false);
        }
    };

    fetchLocations();

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Save to LocalStorage whenever savedJobs changes
  useEffect(() => {
    localStorage.setItem('vagasRioSavedJobs', JSON.stringify(savedJobs));
  }, [savedJobs]);

  // Loading Animation Logic (Progress Bar & Counters & Smooth Text)
  useEffect(() => {
    let msgInterval: any;
    let progressInterval: any;

    if (isLoading) {
      setLoadingMsgIndex(Math.floor(Math.random() * LOADING_MESSAGES.length)); // Start random
      setSearchProgress(0);
      setMsgOpacity(1);

      // Cycle messages with smooth fade
      msgInterval = setInterval(() => {
        setMsgOpacity(0); // Fade out
        
        setTimeout(() => {
            // Randomly pick a quote to keep it fresh
            const nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
            setLoadingMsgIndex(nextIndex);
            setMsgOpacity(1); // Fade in
        }, 300); 

      }, 3000); // Give enough time to read the joke

      // Phased Progress Bar Logic
      progressInterval = setInterval(() => {
        setSearchProgress((prev) => {
            if (prev >= 95) return 95;
            let increment = 0;
            const jitter = Math.random() * 0.3; 
            if (prev < 30) { increment = 2.0 + jitter; }
            else if (prev < 60) { increment = 0.8 + jitter; }
            else if (prev < 85) { increment = 0.4 + jitter; }
            else { increment = 0.05 + Math.random() * 0.1; }
            return Math.min(prev + increment, 95);
        });

      }, 200); 

    } else {
       setSearchProgress(100);
       setMsgOpacity(1);
    }

    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, [isLoading]);

  // Optimized Filter Logic for Locations
  const filteredLocations = useMemo(() => {
    if (!location) return allLocations.slice(0, 20); // Show top 20 if empty
    
    const lowerTerm = location.toLowerCase();
    // Filter and limit to 50 results for performance
    const matches = [];
    for (let i = 0; i < allLocations.length; i++) {
        if (allLocations[i].toLowerCase().includes(lowerTerm)) {
            matches.push(allLocations[i]);
            if (matches.length >= 50) break;
        }
    }
    return matches;
  }, [location, allLocations]);

  // Reset highlighted index when filtered locations change
  useEffect(() => {
     setHighlightedIndex(-1);
  }, [filteredLocations]);

  // Scroll active element into view
  useEffect(() => {
    if (showLocationSuggestions && highlightedIndex >= 0 && suggestionsListRef.current) {
        const listItems = suggestionsListRef.current.children;
        if (listItems[highlightedIndex]) {
            listItems[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
  }, [highlightedIndex, showLocationSuggestions]);

  // Pagination Logic
  const indexOfLastJob = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstJob = indexOfLastJob - ITEMS_PER_PAGE;
  const currentJobs = results.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    // Smooth scroll to results top
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Prevent submit on Enter for specific fields
  const preventFormSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  // Handle Location Input Key Navigation
  const handleLocationKeyDown = (e: React.KeyboardEvent) => {
      if (!showLocationSuggestions || filteredLocations.length === 0) {
        // Even if no suggestions, we might want to prevent default submit if desired,
        // but generally if no suggestions, Enter might just leave the field as is.
        // The user requested prevent submit on 'location' specifically.
        if (e.key === 'Enter') e.preventDefault();
        return;
      }

      if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex(prev => prev < filteredLocations.length - 1 ? prev + 1 : prev);
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
      } else if (e.key === 'Tab') {
          if (highlightedIndex >= 0) {
              // Select item and close, native Tab behavior will move focus to next input
              setLocation(filteredLocations[highlightedIndex]);
              setShowLocationSuggestions(false);
          }
      } else if (e.key === 'Enter') {
           e.preventDefault(); // ALWAYS prevent form submit on Enter in this field
           if (highlightedIndex >= 0) {
              setLocation(filteredLocations[highlightedIndex]);
              setShowLocationSuggestions(false);
          }
      } else if (e.key === 'Escape') {
           setShowLocationSuggestions(false);
      }
  };

  const toggleSaveJob = (e: React.MouseEvent, job: JobResult) => {
    e.stopPropagation();
    
    const isSaved = savedJobs.some(saved => saved.title === job.title && saved.company === job.company);
    
    if (isSaved) {
      setSavedJobs(prev => prev.filter(saved => !(saved.title === job.title && saved.company === job.company)));
    } else {
      setSavedJobs(prev => [{ ...job, savedAt: Date.now() }, ...prev]);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedJobId(prev => prev === id ? null : id);
  };

  const getDateRangeLabel = (val: string) => {
    switch(val) {
      case '12h': return 'Publicadas nas últimas 12 horas';
      case '24h': return 'Publicadas nas últimas 24 horas';
      case '3d': return 'Publicadas nos últimos 3 dias';
      case '7d': return 'Publicadas na última semana';
      case '30d': return 'Publicadas no último mês';
      case '90d': return 'Publicadas nos últimos 3 meses';
      default: return 'Qualquer data (Recentes priorizadas)';
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!role.trim()) {
      setError("Por favor, informe qual cargo você está procurando.");
      return;
    }
    if (!location.trim()) {
      setError("Por favor, informe a localização desejada.");
      return;
    }

    setIsLoading(true);
    setHasSearched(false);
    setError(null);
    setResults([]);
    setGroundingLinks([]);
    setRawText(null);
    setExpandedJobId(null);
    setCurrentPage(1); // Reset to first page on new search

    try {
      if (isApiKeyMissing) {
        throw new Error("API Key não configurada.");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const dateInstruction = getDateRangeLabel(dateRange);
      
      const workModelInstruction = workModel !== 'any' ? `Apenas vagas no modelo **${workModel}**.` : "Qualquer modelo de trabalho (Remoto, Híbrido ou Presencial).";
      const contractInstruction = contractType !== 'any' ? `Apenas vagas com contrato **${contractType}**.` : "Qualquer tipo de contrato (CLT, PJ, Estágio, etc).";
      
      // Map time-based experience to highly specific AI instructions regarding DESCRIPTION TEXT analysis
      let experienceInstruction = "Qualquer nível de experiência.";
      if (experienceLevel === 'under_6_months') {
         experienceInstruction = "Leia a descrição da vaga: Busque obrigatoriamente vagas que mencionem 'Sem experiência', 'Estágio', 'Trainee' ou peçam 'menos de 6 meses'.";
      } else if (experienceLevel === 'under_1_year') {
         experienceInstruction = "Leia a descrição da vaga: Busque vagas que peçam no MÁXIMO 1 ano de experiência ou aceitem iniciantes.";
      } else if (experienceLevel === '1_to_2_years') {
         experienceInstruction = "Leia a descrição da vaga: Busque vagas onde o texto da descrição exige explicitamente '1 ano', '2 anos' ou '1 a 2 anos' de experiência.";
      } else if (experienceLevel === '2_to_4_years') {
         experienceInstruction = "Leia a descrição da vaga: Busque vagas onde o texto da descrição exige explicitamente '2 anos', '3 anos', '4 anos' ou faixas como '2 a 4 anos' de experiência.";
      } else if (experienceLevel === 'over_4_years') {
         experienceInstruction = "Leia a descrição da vaga: Busque vagas onde o texto da descrição exige explicitamente MAIS DE 4 ANOS, '5+ anos', 'Sênior' ou vasta experiência.";
      }

      const prompt = `
        Você é um headhunter de elite focado em encontrar as melhores oportunidades reais e verificadas.
        Sua missão: Encontrar **o máximo de vagas ativas possível (META: 10 a 20 vagas)** para o cargo de "${role}" em "${location}".

        REGRAS DE OURO (Siga estritamente):
        1. **VALIDAÇÃO DE DISPONIBILIDADE E QUALIDADE DO LINK**:
           - **CRÍTICO - LINK DE APLICAÇÃO:** O campo 'applicationLink' DEVE ser uma URL válida e funcional.
           - **TIPO DE LINK:** Priorize links diretos para a vaga ou formulário de candidatura. Se não houver link direto, links para a página de carreiras/trabalhe conosco da empresa são ACEITÁVEIS (não descarte vagas boas só por causa disso, apenas garanta que o link não seja quebrado).
           - **EVITE:** Páginas de erro (404) ou strings que não pareçam URLs.
           - **FILTRO DE STATUS:** Se o snippet disser "Vaga encerrada", "Não aceita mais candidaturas" ou "Expirou", **NÃO** inclua na lista.
           - **AGREGADORES:** Links do LinkedIn, Indeed, Glassdoor, Gupy, Kenoby são permitidos.
           - Respeite o período: ${dateInstruction}.

        2. **FILTROS OBRIGATÓRIOS DO USUÁRIO**:
           - Modelo de Trabalho: ${workModelInstruction} (Se diferente de "Qualquer", ignore vagas que não batam).
           - Tipo de Contrato: ${contractInstruction} (Se diferente de "Qualquer", ignore vagas que não batam).
           - **CRITÉRIO CRÍTICO DE EXPERIÊNCIA:** ${experienceInstruction} (IMPORTANTE: Analise o TEXTO DA DESCRIÇÃO em busca de requisitos numéricos de tempo como "2 anos", "3+ years", "experiência mínima de X meses". Não se baseie apenas no título do cargo. Se a vaga pede "5 anos" e o filtro é "1-2 anos", descarte a vaga).
           - Requisitos extras: "${requirements}"

        3. **QUANTIDADE E ORDENAÇÃO**:
           - **VOLUME:** Retorne uma lista robusta. Não se limite a poucos resultados. Se houver disponibilidade, traga pelo menos 10 opções.
           - **RECÊNCIA (MUITO IMPORTANTE):** Mesmo se o período for amplo (ex: mês), priorize SEMPRE as vagas publicadas mais recentemente (hoje, ontem, nesta semana).
           - **QUALIDADE:** Em seguida, priorize as que informam SALÁRIO e BENEFÍCIOS.

        FORMATO DE SAÍDA:
        Retorne APENAS um array JSON válido. Não use markdown.
        
        Esquema do Objeto JSON:
        {
          "id": 1, // sequencial
          "title": "Título da Vaga",
          "company": "Nome da Empresa",
          "location": "Localização",
          "postedDate": "Data relativa (ex: Há 3h, Ontem)",
          "description": "Resumo atrativo (max 250 caracteres)",
          "salary": "Valor numérico (ex: R$ 4.500) ou 'A combinar'",
          "benefits": "Lista de benefícios separados por vírgula ou null",
          "requirements": "Lista de requisitos técnicos e comportamentais separados por vírgula (ex: Java, Inglês, Proatividade) ou null",
          "applicationLink": "Link para aplicação (começando com https://).",
          "matchReason": "Motivo da escolha (Destaque o salário, benefícios ou modelo de trabalho)"
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      setGroundingLinks(chunks as GroundingChunk[]);

      try {
        let parsedData = null;

        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
           const jsonCandidate = text.substring(firstBracket, lastBracket + 1);
           try {
             parsedData = JSON.parse(jsonCandidate);
           } catch (e) {
             console.warn("Failed to parse extracted JSON candidate, falling back to full text cleaning");
           }
        }

        if (!parsedData) {
            let cleanJson = text.trim();
            cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
            parsedData = JSON.parse(cleanJson);
        }

        if (Array.isArray(parsedData)) {
            setResults(parsedData);
        } else if (parsedData && parsedData.jobs && Array.isArray(parsedData.jobs)) {
             setResults(parsedData.jobs);
        } else {
            setRawText(text);
        }
      } catch (jsonError) {
        console.warn("JSON Parse error, displaying raw text", jsonError);
        setRawText(text);
      }
    } catch (err: any) {
      console.error(err);
      setError("Ops! Tivemos um probleminha ao buscar as vagas. Tenta de novo? Erro: " + (err.message || "Desconhecido"));
    } finally {
      setIsLoading(false);
      setHasSearched(true);
      setSearchProgress(100); // Ensure complete
    }
  };

  // --- API KEY MISSING BLOCKING SCREEN ---
  if (isApiKeyMissing) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border-l-4 border-red-500 shadow-xl p-8 rounded-sm font-typewriter">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-red-100 p-3 rounded-full">
               <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 uppercase">Acesso Negado</h1>
          </div>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Parece que a chave de segurança <strong>(API_KEY)</strong> não foi encontrada. Sem ela, nossos detetives digitais não podem investigar as vagas.
          </p>
          <div className="bg-stone-50 p-4 border border-stone-200 text-sm mb-6 font-mono text-stone-600">
            <p>1. Crie um arquivo <strong className="text-stone-800">.env</strong> na raiz do projeto.</p>
            <p className="mt-2">2. Adicione sua chave:</p>
            <code className="block mt-1 bg-stone-200 p-2 rounded text-blue-800">API_KEY=sua_chave_gemini_aqui</code>
            <p className="mt-2">3. Se estiver no Vercel, adicione em <em>Settings > Environment Variables</em>.</p>
          </div>
          <button 
             onClick={() => window.location.reload()}
             className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-sm transition-colors uppercase tracking-widest"
          >
             Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Friendly Hero Section - The Office Meets Brooklyn 99 */}
      <header className="relative pt-24 pb-48 overflow-hidden bg-blue-950 border-b-8 border-amber-400">
         {/* Background Gradients */}
         <div className="absolute inset-0 bg-gradient-to-b from-blue-950 to-blue-900"></div>
         {/* Subtle pattern overlay - police lights hint */}
         <div className="absolute top-0 right-0 w-full h-full opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500 via-transparent to-transparent blur-3xl animate-pulse"></div>
         <div className="absolute bottom-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-amber-400 via-transparent to-transparent blur-3xl"></div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 backdrop-blur-md border border-emerald-500/30 text-xs font-bold tracking-wide uppercase mb-8 text-emerald-100 shadow-lg animate-fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-typewriter text-emerald-300">MONITORAMENTO DE VAGAS: ATIVO</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight leading-[1.1] text-white">
            Seu próximo emprego <br className="hidden md:block"/> 
            <span className="gradient-text">tá aqui.</span>
          </h1>
          <p className="text-blue-100/80 text-lg md:text-xl max-w-2xl mx-auto font-normal leading-relaxed font-serif italic">
            {heroQuote}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto -mt-32 px-6 space-y-12 relative z-20">
        
        {/* Saved Jobs Alert/Dashboard */}
        {savedJobs.length > 0 && (
          <div className="glass-panel rounded-sm shadow-xl shadow-stone-300/20 p-8 animate-fade-in bg-[#FFFDF5] border-l-4 border-amber-400">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3 font-typewriter">
                  <span className="flex items-center justify-center w-8 h-8 bg-amber-100 text-amber-600 rounded-sm border border-amber-200">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
                  </span>
                  CASOS ARQUIVADOS (SALVOS)
                  <span className="text-sm font-medium bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full ml-1 border border-stone-200">{savedJobs.length}</span>
                </h2>
                <button 
                  onClick={() => {
                    if(confirm('Tem certeza que deseja limpar o histórico?')) setSavedJobs([]);
                  }}
                  className="text-sm text-red-500 hover:text-red-600 font-semibold hover:bg-red-50 px-4 py-2 rounded-lg transition-colors font-typewriter"
                >
                  [DELETAR EVIDÊNCIAS]
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedJobs.map((job) => (
                  <JobCard 
                    key={`saved-${job.id}-${job.company}`} 
                    job={job}
                    isSaved={true}
                    isExpanded={expandedJobId === job.id}
                    onToggleSave={toggleSaveJob}
                    onToggleExpand={toggleExpand}
                  />
                ))}
             </div>
          </div>
        )}

        {/* Floating Search Card */}
        <div className="glass-panel rounded-sm shadow-2xl shadow-blue-950/10 p-8 md:p-10 bg-white border-t-4 border-blue-900">
          <form onSubmit={handleSearch} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                  Qual o cargo?
                  <InfoTooltip text="Digite o título da posição (ex: Vendedor, Desenvolvedor) ou área de atuação." />
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600 text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  <input
                    type="text"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    onKeyDown={preventFormSubmit} 
                    className="w-full pl-12 pr-4 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold placeholder-gray-400 font-typewriter"
                    placeholder="Ex: Vendedor de Papel, Detetive..."
                  />
                </div>
              </div>
              
              <div className="space-y-3 relative" ref={locationWrapperRef}>
                <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                  Onde?
                  <InfoTooltip text="Escolha uma cidade da lista ou digite 'Remoto' para vagas à distância." />
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600 text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  </div>
                  <input
                    type="text"
                    value={location}
                    onFocus={() => setShowLocationSuggestions(true)}
                    onKeyDown={handleLocationKeyDown}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setShowLocationSuggestions(true);
                    }}
                    className="w-full pl-12 pr-4 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold placeholder-gray-400 font-typewriter"
                    placeholder="Ex: Scranton, Brooklyn, Remoto..."
                    autoComplete="off"
                  />
                  {/* Dropdown Arrow Indicator */}
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                     {isLocationsLoading ? (
                        <svg className="animate-spin w-4 h-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                     )}
                  </div>
                </div>

                {/* Autocomplete Dropdown */}
                {showLocationSuggestions && (
                  <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-sm shadow-xl shadow-stone-300 border border-stone-200 max-h-60 overflow-y-auto animate-fade-in font-typewriter">
                    {filteredLocations.length > 0 ? (
                      <ul className="py-2" ref={suggestionsListRef}>
                        {filteredLocations.map((loc, idx) => (
                          <li 
                            key={idx}
                            onClick={() => {
                              setLocation(loc);
                              setShowLocationSuggestions(false);
                            }}
                            className={`px-5 py-3 cursor-pointer flex items-center gap-3 text-sm font-medium transition-colors ${
                                idx === highlightedIndex 
                                ? 'bg-blue-50 text-blue-900' 
                                : 'text-gray-700 hover:bg-stone-50'
                            }`}
                          >
                             <span className={`p-1.5 rounded-sm ${idx === highlightedIndex ? 'text-blue-600 bg-white' : 'text-stone-400 bg-stone-100'}`}>
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                             </span>
                             {loc}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-400 italic">
                        {isLocationsLoading 
                            ? "Carregando lista de cidades..." 
                            : "Nenhuma cidade encontrada na lista, mas pode digitar seu bairro ou região específica."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Filters Row: Model, Contract, Experience, Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                  Modelo
                  <InfoTooltip text="Defina se prefere trabalhar de casa, no escritório ou um mix dos dois." />
                </label>
                <div className="relative">
                  <select
                    value={workModel}
                    onChange={(e) => setWorkModel(e.target.value)}
                    className="w-full pl-5 pr-10 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold appearance-none cursor-pointer font-typewriter"
                  >
                    <option value="any">Todos</option>
                    <option value="Remoto">Remoto</option>
                    <option value="Híbrido">Híbrido</option>
                    <option value="Presencial">Presencial</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>

               <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                  Contrato
                  <InfoTooltip text="Selecione o tipo de vínculo empregatício desejado (CLT com benefícios, PJ, Estágio)." />
                </label>
                <div className="relative">
                  <select
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value)}
                    className="w-full pl-5 pr-10 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold appearance-none cursor-pointer font-typewriter"
                  >
                    <option value="any">Todos</option>
                    <option value="CLT">CLT</option>
                    <option value="PJ">PJ</option>
                    <option value="Estágio">Estágio</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                  Anos de Experiência
                  <InfoTooltip text="A IA filtrará vagas que exigem o tempo de experiência selecionado." />
                </label>
                <div className="relative">
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full pl-5 pr-10 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold appearance-none cursor-pointer font-typewriter"
                  >
                    <option value="any">Todos</option>
                    <option value="under_6_months">Sem experiência / &lt; 6 meses</option>
                    <option value="under_1_year">Iniciante (&lt; 1 ano)</option>
                    <option value="1_to_2_years">1 a 2 anos</option>
                    <option value="2_to_4_years">2 a 4 anos</option>
                    <option value="over_4_years">Mais de 4 anos</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                  Quando?
                  <InfoTooltip text="Filtrar vagas publicadas recentemente para aumentar chances de resposta." />
                </label>
                <div className="relative">
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full pl-5 pr-10 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold appearance-none cursor-pointer font-typewriter"
                  >
                    <option value="12h">Últimas 12 horas</option>
                    <option value="24h">Últimas 24 horas</option>
                    <option value="3d">Últimos 3 dias</option>
                    <option value="7d">Última semana</option>
                    <option value="30d">Último mês</option>
                    <option value="90d">Últimos 3 meses</option>
                    <option value="any">Qualquer data</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
                 <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-wide opacity-80 font-typewriter">
                   Instruções para a IA (Campo Livre)
                   <InfoTooltip text="Este campo é enviado diretamente para o agente de IA. Escreva livremente: peça cultura específica, benefícios detalhados ou o que evitar." />
                 </label>
                 <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600 text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <input
                      type="text"
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-sm bg-stone-50 border-0 ring-1 ring-stone-200 focus:ring-2 focus:ring-blue-800 focus:bg-white outline-none transition-all text-gray-900 font-semibold placeholder-gray-400 font-typewriter"
                      placeholder="Ex: 'Quero ambiente startup, sem dress code, que aceite pets. Evite vagas de consultoria.'"
                    />
                 </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className={`relative w-full py-5 rounded-sm font-bold text-white shadow-xl transition-all transform overflow-hidden border-2 border-blue-950 ${
                  isLoading 
                    ? 'cursor-not-allowed shadow-inner bg-stone-200 border-stone-300' 
                    : 'bg-blue-900 hover:bg-blue-800 shadow-blue-900/30 hover:-translate-y-1 active:translate-y-0 active:mt-1'
                }`}
              >
                {isLoading ? (
                   <>
                      {/* Siren Animation Background */}
                      <div 
                        className="absolute inset-0 siren-bar opacity-30"
                      ></div>
                      
                      {/* Smooth Progress Bar */}
                      <div 
                        className="absolute bottom-0 left-0 h-1 bg-amber-400 transition-all duration-300 ease-out z-20"
                        style={{ width: `${searchProgress}%` }}
                      ></div>

                      {/* Content Overlay */}
                      <div className="relative z-10 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-lg font-bold text-white text-shadow-sm tracking-tight drop-shadow-md font-typewriter uppercase">
                              INVESTIGANDO...
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-white drop-shadow-md">
                           <span className="transition-opacity duration-300 min-w-[250px] text-center font-typewriter" style={{ opacity: msgOpacity }}>
                               {LOADING_MESSAGES[loadingMsgIndex]}
                           </span>
                        </div>
                      </div>
                   </>
                ) : (
                  <span className="flex items-center justify-center gap-2 text-xl tracking-tight font-typewriter uppercase">
                    INICIAR BUSCA
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-5 rounded-sm flex gap-4 animate-fade-in text-red-700 shadow-sm font-typewriter">
             <div className="bg-red-100 p-2 rounded-full h-fit">
               <svg className="w-6 h-6 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             </div>
             <div>
               <h4 className="font-bold text-red-800 uppercase">Erro no Protocolo</h4>
               <p className="text-sm mt-1">{error}</p>
             </div>
          </div>
        )}

        {/* No Results Friendly Message */}
        {!isLoading && hasSearched && results.length === 0 && !rawText && !error && (
           <div className="text-center py-12 animate-fade-in glass-panel rounded-sm p-8 border-t-4 border-stone-400">
               <div className="bg-stone-100 inline-flex p-4 rounded-full mb-4 shadow-sm">
                   <svg className="w-8 h-8 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
               </div>
               <h3 className="text-xl font-bold text-gray-800 mb-2 font-typewriter">NENHUMA EVIDÊNCIA ENCONTRADA</h3>
               <p className="text-gray-500 max-w-md mx-auto">Talvez as vagas estejam escondidas no anexo do escritório ou na sala de evidências. Tente filtros mais amplos.</p>
           </div>
        )}

        {/* Results Area */}
        {(results.length > 0 || rawText) && (
          <div ref={resultsRef} className="animate-fade-in space-y-8 pb-12">
            <div className="flex items-center justify-between px-2 flex-wrap gap-4">
              <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight font-typewriter">
                RELATÓRIO DE VAGAS 
                <span className="text-lg font-medium text-gray-400 ml-2">({results.length} CASOS ABERTOS)</span>
              </h2>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-none text-xs font-bold bg-white text-blue-900 border border-blue-900 shadow-[4px_4px_0px_rgba(23,37,84,0.2)] font-typewriter">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                STATUS: CONCLUÍDO
              </span>
            </div>

            {/* Structured Results */}
            {results.length > 0 ? (
              <div className="grid grid-cols-1 gap-8">
                {currentJobs.map((job) => {
                  const isSaved = savedJobs.some(s => s.title === job.title && s.company === job.company);
                  return (
                    <JobCard 
                      key={job.id} 
                      job={job}
                      isSaved={isSaved}
                      isExpanded={expandedJobId === job.id}
                      onToggleSave={toggleSaveJob}
                      onToggleExpand={toggleExpand}
                    />
                  );
                })}
              </div>
            ) : (
                <div className="bg-white p-10 rounded-sm shadow-sm border border-stone-200 prose prose-stone max-w-none font-typewriter">
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(rawText || "") }} />
                </div>
            )}

            {/* Pagination Controls */}
            {results.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-center gap-4 py-6 animate-fade-in">
                 <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2 px-5 py-3 rounded-sm font-bold text-sm bg-white border border-stone-300 text-gray-600 hover:border-blue-800 hover:text-blue-800 hover:shadow-[4px_4px_0px_rgba(0,0,0,0.1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all font-typewriter uppercase"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                    Anterior
                 </button>
                 
                 <span className="text-sm font-bold text-gray-500 bg-white px-4 py-2 rounded-sm border border-stone-300 shadow-sm font-typewriter">
                    PÁGINA {currentPage} DE {totalPages}
                 </span>

                 <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-2 px-5 py-3 rounded-sm font-bold text-sm bg-white border border-stone-300 text-gray-600 hover:border-blue-800 hover:text-blue-800 hover:shadow-[4px_4px_0px_rgba(0,0,0,0.1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all font-typewriter uppercase"
                 >
                    Próxima
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                 </button>
              </div>
            )}

            {/* Grounding Sources */}
            {groundingLinks.length > 0 && (
              <div className="pt-10 border-t border-stone-300 border-dashed">
                <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-6 px-1 font-typewriter">
                  Fontes da Investigação
                </h3>
                <div className="flex flex-wrap gap-3">
                  {groundingLinks.map((chunk, idx) => {
                    const normalizedUri = normalizeUrl(chunk.web?.uri);
                    if (!normalizedUri) return null;
                    return (
                      <a 
                        key={idx}
                        href={normalizedUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 px-4 py-2.5 bg-white rounded-sm border border-stone-300 hover:border-blue-800 hover:shadow-[2px_2px_0px_rgba(0,0,0,0.1)] transition-all text-xs font-semibold text-gray-600 hover:text-blue-900 group font-typewriter"
                      >
                        <span className="w-6 h-6 rounded-sm bg-stone-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors border border-stone-200">
                           <img src={`https://www.google.com/s2/favicons?domain=${new URL(normalizedUri).hostname}`} alt="" className="w-3.5 h-3.5 opacity-60" />
                        </span>
                        {chunk.web?.title || new URL(normalizedUri).hostname}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-6 pt-12 pb-12 text-center">
        <div className="border-t border-stone-300 pt-8 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 text-xs font-medium text-stone-400 uppercase tracking-widest font-typewriter">
            <span className="hover:text-stone-600 transition-colors cursor-default">
               Developed by Arthurs Pavão
            </span>
            <span className="hidden md:block w-1 h-1 bg-stone-300 rounded-full"></span>
            <span className="flex items-center gap-2 hover:text-stone-600 transition-colors cursor-default">
               Powered by Google Gemini
            </span>
        </div>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);