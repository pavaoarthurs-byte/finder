import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Interface da Vaga
interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  contract: string;
  salary: string;
  summary: string;
  url: string | null;
  matchScore: number;
  postedAt?: string;
  benefits: string[];
  requirements: string[];
  contact?: string;
  sourceInfo?: string;
  isGoogleVerified: boolean; 
}

// Interface para Município do IBGE
interface IBGECity {
  id: number;
  nome: string;
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        sigla: string;
      }
    }
  };
}

function App() {
  // --- VERIFICAÇÃO DE CONFIGURAÇÃO (API KEY) ---
  // Acessa a variável injetada pelo Vite no momento do build
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-100 font-typewriter">
        <div className="max-w-lg w-full bg-white p-8 border-2 border-stone-300 shadow-xl rounded-sm relative">
           <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-1 font-bold text-xs uppercase tracking-widest rounded-sm shadow-sm">
             Erro de Configuração
           </div>
           <h1 className="text-2xl font-bold text-stone-800 mb-4 flex items-center gap-2">
             🚫 Chave de Acesso Ausente
           </h1>
           <p className="text-stone-600 mb-6 text-sm leading-relaxed">
             O aplicativo não detectou a <strong>API_KEY</strong>. Isso é comum no primeiro deploy na Vercel.
           </p>
           
           <div className="bg-stone-50 p-4 border border-stone-200 mb-6 rounded text-sm">
             <strong className="block text-stone-800 mb-2 uppercase tracking-wide text-xs">Como Resolver na Vercel:</strong>
             <ol className="list-decimal list-inside space-y-2 text-stone-600">
               <li>Vá em <strong>Settings</strong> do seu projeto.</li>
               <li>Clique em <strong>Environment Variables</strong>.</li>
               <li>Adicione Key: <code className="bg-stone-200 px-1 rounded text-red-600">API_KEY</code></li>
               <li>Adicione Value: <em>Sua chave Gemini (começa com AIza...)</em></li>
               <li><strong>CRUCIAL:</strong> Vá na aba <strong>Deployments</strong> e clique nos três pontinhos do último deploy -&gt; <strong>Redeploy</strong>.</li>
             </ol>
           </div>
           
           <p className="text-xs text-stone-400 text-center">
             As variáveis de ambiente são "fixadas" no momento do build. Adicionar a chave sem fazer o Redeploy não surtirá efeito.
           </p>
        </div>
      </div>
    );
  }

  // --- ESTADOS DOS FILTROS ---
  const [role, setRole] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [filteredCities, setFilteredCities] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const cityInputRef = useRef<HTMLDivElement>(null);
  const [workModel, setWorkModel] = useState('Todos');
  const [contractType, setContractType] = useState('Todos');
  const [experience, setExperience] = useState('Todos');
  const [dateRange, setDateRange] = useState('Qualquer data');
  const [aiInstructions, setAiInstructions] = useState('');

  // --- ESTADOS DA APLICAÇÃO ---
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  // --- ESTADOS DE PAGINAÇÃO ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Inicialização segura da IA
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // --- CARREGAR CIDADES ---
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
        const data: IBGECity[] = await response.json();
        const formattedCities = data
          .map(city => {
            const uf = city?.microrregiao?.mesorregiao?.UF?.sigla;
            return uf ? `${city.nome} - ${uf}` : null;
          })
          .filter((city): city is string => city !== null);
        setCities(formattedCities);
      } catch (e) {
        console.error("Erro ao carregar cidades", e);
      }
    };
    fetchCities();
  }, []);

  useEffect(() => {
    if (locationQuery.length > 2) {
      const filtered = cities.filter(c => 
        c.toLowerCase().includes(locationQuery.toLowerCase())
      ).slice(0, 10);
      setFilteredCities(filtered);
    } else {
      setFilteredCities([]);
    }
  }, [locationQuery, cities]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cityInputRef.current && !cityInputRef.current.contains(event.target as Node)) {
        setShowCitySuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- PROGRESSO ---
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress((prev) => {
            if (prev < 20) return prev + 0.5;
            if (prev < 50) return prev + 0.2;
            if (prev < 80) return prev + 0.5;
            if (prev < 95) return prev + 0.1;
            return prev;
        });
      }, 50);
    } else if (!isLoading && progress > 0) {
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const toggleJob = (id: string) => {
    setExpandedJobId(prev => prev === id ? null : id);
  };

  // --- VALIDAÇÃO DE URL (CROSS-MATCHING) ---
  const verifyAgainstGrounding = (jobUrl: string | null, groundingChunks: any[]): boolean => {
    if (!jobUrl || !groundingChunks || groundingChunks.length === 0) return false;
    
    const normalize = (u: string) => {
        try { 
            const urlObj = new URL(u);
            return urlObj.hostname.replace('www.', '') + urlObj.pathname;
        } catch { 
            return u.toLowerCase().replace(/https?:\/\/(www\.)?/, '').split('?')[0]; 
        }
    };

    const target = normalize(jobUrl);

    return groundingChunks.some(chunk => {
        const sourceUrl = chunk.web?.uri;
        if (!sourceUrl) return false;
        const source = normalize(sourceUrl);
        return source.includes(target) || target.includes(source);
    });
  };

  // --- FUNÇÃO AUXILIAR COM RETRY ---
  const generateContentWithRetry = async (modelName: string, prompt: string, config: any, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: config
        });
      } catch (err: any) {
        // Se for o último retry ou não for erro de quota, lança o erro
        const isQuotaError = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
        if (i === retries || !isQuotaError) throw err;
        
        // Espera exponencial: 2s, 4s...
        const delay = 2000 * Math.pow(2, i);
        console.log(`Tentativa ${i + 1} falhou por cota. Aguardando ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  // --- BUSCA ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setJobs([]);
    setCurrentPage(1); // Resetar página na nova busca
    setHasSearched(true);
    setExpandedJobId(null);

    try {
      setLoadingStep('1. Executando busca ampla com parâmetros...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      let searchContext = `vagas ${role} em ${locationQuery}`;
      if (workModel !== 'Todos') searchContext += ` ${workModel}`;
      if (contractType !== 'Todos') searchContext += ` ${contractType}`;
      
      if (dateRange === 'Últimas 24 horas') searchContext += ` "últimas 24 horas"`;
      else if (dateRange === 'Última Semana') searchContext += ` "última semana"`;
      else if (dateRange !== 'Qualquer data') searchContext += ` recente`;

      setLoadingStep('2. Coletando links e extraindo dados...');

      // PROMPT OTIMIZADO PARA MENOR CONSUMO DE TOKENS
      const prompt = `
        ATUE COMO UM EXTRATOR DE DADOS DE PESQUISA.
        
        OBJETIVO: Pesquisar vagas reais e retornar um JSON Array.
        
        PASSO 1: PESQUISA
        Busque no Google por: "${searchContext}".
        
        PASSO 2: FILTRAGEM E RETORNO
        Selecione APENAS as 15 MELHORES vagas encontradas.
        Não traga resultados irrelevantes.
        Mantenha os textos curtos e objetivos.
        
        PASSO 3: FORMATO OBRIGATÓRIO
        Você deve retornar APENAS um bloco de código markdown JSON válido.
        Formato: \`\`\`json [ ... ] \`\`\`
        
        Estrutura de cada objeto no array:
        {
          "id": "string",
          "title": "string",
          "company": "string",
          "location": "string",
          "type": "string (Remoto/Híbrido/Presencial)",
          "contract": "string (CLT/PJ)",
          "salary": "string (ou 'A combinar')",
          "summary": "string (Max 20 palavras)",
          "url": "string (URL real encontrada)",
          "postedAt": "string (ex: 2h atrás)",
          "benefits": ["string"],
          "requirements": ["string"],
          "sourceInfo": "string (ex: LinkedIn)"
        }

        Contexto Extra:
        - Experiência: ${experience}
        - Instruções: ${aiInstructions}
        
        IMPORTANTE: Se encontrar links nos resultados da pesquisa, use-os no campo "url". Não invente links.
      `;

      // ALTERADO: Usando gemini-2.5-flash para melhor estabilidade de cota e função com retry
      const response: any = await generateContentWithRetry(
        'gemini-2.5-flash', 
        prompt, 
        {
          tools: [{ googleSearch: {} }]
        }
      );

      setLoadingStep('3. Validando links (Cross-Check)...');
      await new Promise(resolve => setTimeout(resolve, 500));

      if (response.text) {
         // EXTRAÇÃO ROBUSTA DE JSON
         // O Google Search tool muitas vezes adiciona texto antes ou depois do JSON.
         // Usamos regex para pegar apenas o conteúdo entre blocos ```json ... ```
         const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) || response.text.match(/```\s*([\s\S]*?)\s*```/);
         
         let jsonString = "";
         if (jsonMatch && jsonMatch[1]) {
            jsonString = jsonMatch[1];
         } else if (response.text.trim().startsWith('[') || response.text.trim().startsWith('{')) {
            // Tentativa de pegar o texto direto se não houver markdown
            jsonString = response.text;
         } else {
            console.warn("Resposta bruta da IA:", response.text);
            throw new Error("A IA não retornou um formato JSON válido. Tente novamente.");
         }

         let data;
         try {
            data = JSON.parse(jsonString);
         } catch (parseError) {
            console.error("Erro de Parse JSON:", parseError);
            throw new Error("Falha ao processar os dados retornados pela IA.");
         }
         
         if (!Array.isArray(data)) {
            // Se retornou um objeto único, encapsula em array
            data = [data];
         }
         
         const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
         
         const validatedData = data.map((j: any) => {
           // Normalização segura de URL
           let currentUrl = j.url;
           // Se a URL parecer placeholder ou inválida, tenta pegar do grounding se possível
           // (Lógica simplificada aqui mantendo o que já existia)
           
           const verifiedByGoogle = verifyAgainstGrounding(currentUrl, groundingChunks);
           
           let score = 70;
           if (verifiedByGoogle) score += 20;
           if (j.salary && j.salary !== "A combinar") score += 5;
           if (j.company && j.company !== "Confidencial") score += 5;

           return {
             id: j.id || Math.random().toString(36).substr(2, 9), // Fallback de ID
             title: j.title || "Vaga Sem Título",
             company: j.company || "Empresa Confidencial",
             location: j.location || "Local não informado",
             type: j.type || "Presencial",
             contract: j.contract || "CLT",
             salary: j.salary || "A combinar",
             summary: j.summary || "Sem descrição disponível.",
             url: currentUrl || null,
             matchScore: Math.min(100, score),
             postedAt: j.postedAt,
             benefits: Array.isArray(j.benefits) ? j.benefits : [],
             requirements: Array.isArray(j.requirements) ? j.requirements : [],
             sourceInfo: j.sourceInfo || "Web",
             isGoogleVerified: verifiedByGoogle
           };
         });

         setJobs(validatedData);
      } else {
        throw new Error("A IA retornou uma resposta vazia.");
      }

    } catch (err: any) {
      console.error(err);
      
      let finalErrorMessage = err.message || "Não foi possível completar a investigação. Tente reformular os filtros.";
      
      // Tratamento específico para erro 429 / Quota Excedida
      if (finalErrorMessage.includes("429") || 
          finalErrorMessage.includes("quota") || 
          finalErrorMessage.includes("RESOURCE_EXHAUSTED")) {
         finalErrorMessage = "⚠️ COTA DE USO EXCEDIDA (ERRO 429). O plano gratuito da IA tem limites de requisições por minuto. Por favor, aguarde 1 minuto e tente novamente.";
      } 
      // Tenta limpar mensagens JSON brutas
      else if (finalErrorMessage.includes(`"error":`)) {
          try {
             const jsonPart = finalErrorMessage.substring(finalErrorMessage.indexOf('{'));
             const parsed = JSON.parse(jsonPart);
             if (parsed.error?.message) {
                 // Se o erro interno for de quota, aplica a mensagem amigável também
                 if (parsed.error.message.includes("quota") || parsed.error.code === 429) {
                     finalErrorMessage = "⚠️ COTA DE USO EXCEDIDA (ERRO 429). Aguarde alguns instantes.";
                 } else {
                     finalErrorMessage = parsed.error.message;
                 }
             }
          } catch {
             // Mantém a mensagem original se falhar o parse
          }
      }

      setError(finalErrorMessage);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleClearRequest = () => {
     // Se não tiver nada preenchido, limpa direto sem incomodar
     if (!role && !locationQuery && jobs.length === 0 && !aiInstructions && workModel === 'Todos') {
        executeClear();
     } else {
        setShowClearModal(true);
     }
  };

  const executeClear = () => {
    setRole('');
    setLocationQuery('');
    setWorkModel('Todos');
    setContractType('Todos');
    setExperience('Todos');
    setDateRange('Qualquer data');
    setAiInstructions('');
    setJobs([]);
    setError(null);
    setHasSearched(false);
    setCurrentPage(1);
    setShowClearModal(false);
  };

  const getGoogleSearchUrl = (job: Job) => {
    const query = encodeURIComponent(`vaga ${job.title} ${job.company} ${job.location}`);
    return `https://www.google.com/search?q=${query}`;
  };

  // Cálculos de Paginação
  const indexOfLastJob = currentPage * itemsPerPage;
  const indexOfFirstJob = indexOfLastJob - itemsPerPage;
  const currentJobs = jobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(jobs.length / itemsPerPage);

  const paginate = (pageNumber: number) => {
      setCurrentPage(pageNumber);
      const resultsHeader = document.getElementById('results-header');
      if (resultsHeader) {
          resultsHeader.scrollIntoView({ behavior: 'smooth' });
      }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto pb-20 relative">
      
      {/* MODAL DE CONFIRMAÇÃO */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-[#FFFDF5] border-2 border-stone-400 p-6 rounded shadow-2xl max-w-sm w-full relative transform transition-all scale-100 rotate-1">
                {/* Visual de "Papel Timbrado" ou Nota */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-4 bg-red-100/50 rotate-[-2deg] border border-red-200 shadow-sm"></div>
                
                <h3 className="text-xl font-bold text-stone-800 mb-2 font-typewriter flex items-center gap-2">
                   <span className="text-2xl">⚠️</span>
                   ATENÇÃO
                </h3>
                <p className="text-stone-600 mb-6 text-sm font-typewriter leading-relaxed">
                   Deseja arquivar esta investigação? Todos os dados coletados e filtros serão perdidos.
                </p>
                <div className="flex justify-end gap-3 pt-4 border-t border-stone-200 border-dashed">
                    <button 
                       onClick={() => setShowClearModal(false)} 
                       className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-stone-500 hover:bg-stone-100 rounded transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                       onClick={executeClear} 
                       className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 rounded shadow-sm transition-colors flex items-center gap-2"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Sim, Limpar
                    </button>
                </div>
           </div>
        </div>
      )}

      {/* HEADER */}
      <div className="folder-tab mb-0 ml-4 relative z-10">
        <div className="bg-white inline-block px-6 py-2 rounded-t-lg border-t border-l border-r border-stone-300 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full bg-red-500 ${isLoading ? 'animate-ping' : ''}`}></span>
            Status: {isLoading ? 'Processando...' : 'Sistema Pronto'}
          </span>
        </div>
      </div>

      <div className="glass-panel p-6 md:p-8 rounded-tr-lg rounded-b-lg rounded-tl-none relative z-0 bg-[#FAFAF9] shadow-xl">
        <header className="mb-8 border-b-2 border-stone-200 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-stone-800 tracking-tight">
              CAÇADOR DE VAGAS
            </h1>
            <p className="text-stone-500 font-typewriter mt-1 text-sm">
              Busca -&gt; Coleta -&gt; Validação -&gt; Exibição
            </p>
          </div>
          <div className="hidden md:block transform rotate-12 opacity-80">
             <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center border-4 border-double border-stone-300 shadow-inner">
                <span className="text-4xl grayscale opacity-50">🕵️</span>
             </div>
          </div>
        </header>

        {/* FORMULÁRIO */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1">
                Qual o cargo?
              </label>
              <input
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Assistente Fiscal, Vendedor, Dev..."
                className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all shadow-inner rounded-sm"
              />
            </div>

            <div className="space-y-2 relative" ref={cityInputRef}>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1">
                Onde? (Busca IBGE)
              </label>
              <input
                type="text"
                value={locationQuery}
                onFocus={() => setShowCitySuggestions(true)}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  setShowCitySuggestions(true);
                }}
                placeholder="Digite para buscar cidade..."
                className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all shadow-inner rounded-sm"
              />
              {showCitySuggestions && filteredCities.length > 0 && (
                <ul className="absolute z-50 w-full bg-white border-2 border-stone-300 mt-1 max-h-60 overflow-y-auto shadow-lg rounded-sm">
                  {filteredCities.map((city, idx) => (
                    <li 
                      key={idx}
                      onClick={() => {
                        setLocationQuery(city);
                        setShowCitySuggestions(false);
                      }}
                      className="px-4 py-2 hover:bg-stone-100 cursor-pointer font-typewriter text-sm text-stone-700 border-b border-stone-100 last:border-0"
                    >
                      {city}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* GRID FILTROS SECUNDÁRIOS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1">Modelo</label>
              <select
                value={workModel}
                onChange={(e) => setWorkModel(e.target.value)}
                className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 shadow-inner cursor-pointer rounded-sm"
              >
                <option value="Todos">Qualquer</option>
                <option value="Remoto">Remoto</option>
                <option value="Híbrido">Híbrido</option>
                <option value="Presencial">Presencial</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1">Contrato</label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 shadow-inner cursor-pointer rounded-sm"
              >
                <option value="Todos">Qualquer</option>
                <option value="CLT">CLT</option>
                <option value="PJ">PJ</option>
                <option value="Estágio">Estágio / Trainee</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1">Experiência</label>
              <select
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 shadow-inner cursor-pointer rounded-sm"
              >
                <option value="Todos">Qualquer Nível</option>
                <option value="Menos de 6 meses">&lt; 6 meses (Júnior)</option>
                <option value="Menos de 1 ano">&lt; 1 ano</option>
                <option value="Mais de 2 anos">&ge; 2 anos (Pleno/Sênior)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1">Publicado em</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 shadow-inner cursor-pointer rounded-sm font-bold text-stone-700"
              >
                <option value="Qualquer data">Qualquer data</option>
                <option value="Últimas 24 horas">Últimas 24 horas</option>
                <option value="Última Semana">Última Semana</option>
                <option value="Último mês">Último mês</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 ml-1 flex justify-between">
              <span>Filtros Especiais (IA)</span>
            </label>
            <textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="Ex: Procure por benefícios como Gympass. Traga vagas com salário visível se possível."
              rows={3}
              className="w-full bg-[#FFFDF5] border-2 border-stone-300 p-3 font-typewriter focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all shadow-inner rounded-sm resize-none"
            />
          </div>

          <div className="pt-6 flex flex-col md:flex-row gap-4 border-t border-stone-200 mt-6 border-dashed">
            <button
              type="button"
              onClick={handleClearRequest}
              disabled={isLoading}
              className="group md:w-1/4 w-full py-4 rounded-sm font-bold text-stone-500 bg-white border-2 border-b-4 border-stone-200 hover:border-red-400 hover:text-red-600 hover:bg-red-50 active:border-b-2 active:translate-y-[2px] transition-all duration-200 uppercase tracking-widest font-typewriter flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              <span className="group-hover:line-through decoration-red-400 decoration-2">Limpar</span>
            </button>
            
            <div className="md:w-3/4 w-full relative">
                {!isLoading ? (
                    <button
                    type="submit"
                    className="w-full h-full py-4 rounded-sm font-bold text-white bg-stone-800 border-2 border-b-4 border-stone-950 hover:bg-stone-700 active:border-b-2 active:translate-y-[2px] transition-all duration-200 uppercase tracking-widest font-typewriter flex items-center justify-center gap-3 shadow-lg hover:shadow-xl group"
                    >
                        <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        <span>Investigar Vagas</span>
                    </button>
                ) : (
                    <div className="w-full h-full min-h-[60px] bg-stone-200 border-2 border-stone-800 rounded-sm relative overflow-hidden bg-footprints">
                        <div 
                           className="h-full bg-stone-800 absolute top-0 left-0 transition-all duration-300 ease-out z-10"
                           style={{ width: `${progress}%` }}
                        ></div>
                        <div 
                           className="absolute top-1/2 -translate-y-1/2 z-20 transition-all duration-300 ease-out flex flex-col items-center"
                           style={{ left: `calc(${progress}% - 24px)` }}
                        >
                            <div className="text-white animate-walk drop-shadow-md">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 14C12.5523 14 13 13.5523 13 13C13 12.4477 12.5523 12 12 12C11.4477 12 11 12.4477 11 13C11 13.5523 11.4477 14 12 14Z" fill="#F59E0B" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M21 21L16.65 16.65" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center z-30">
                            <span className="bg-white/90 px-3 py-1 rounded text-xs font-bold text-stone-800 uppercase tracking-widest font-typewriter border border-stone-300 shadow-sm backdrop-blur-sm">
                                {loadingStep} {Math.round(progress)}%
                            </span>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </form>
      </div>

      {/* ÁREA DE RESULTADOS */}
      {error && (
        <div className="mt-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 font-typewriter text-sm shadow-md animate-in fade-in duration-300" role="alert">
          <p className="font-bold flex items-center gap-2 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            ERRO NA BUSCA:
          </p>
          <p className="ml-7 whitespace-pre-wrap leading-relaxed">{error}</p>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="mt-8 grid gap-6" id="results-header">
          <div className="flex items-center gap-4 mb-2">
            <span className="h-px bg-stone-300 flex-grow"></span>
            <h2 className="text-stone-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
              <span className="bg-stone-200 text-stone-600 px-2 py-1 rounded text-xs">{jobs.length}</span>
              Dossiês Compilados
            </h2>
            <span className="h-px bg-stone-300 flex-grow"></span>
          </div>

          <div className="text-center mb-4">
            <p className="text-[10px] text-stone-500 font-typewriter">
                Selo Azul = Link confirmado nos resultados do Google. <br/>
                Selo Amarelo = Informação extraída, mas link requer verificação manual.
            </p>
          </div>

          {currentJobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const isVerified = job.isGoogleVerified;
            
            return (
              <div 
                key={job.id} 
                className={`bg-white border-2 transition-all duration-300 relative overflow-hidden group rounded-sm
                  ${isExpanded ? 'border-stone-500 shadow-2xl scale-[1.01] z-10' : 'border-stone-200 hover:-translate-y-1 hover:border-stone-400 hover:shadow-xl'}
                `}
                style={{ backgroundImage: 'radial-gradient(#E7E5E4 1px, transparent 1px)', backgroundSize: '16px 16px' }}
              >
                {/* CLIP INDICATOR */}
                <div className={`absolute -top-3 left-8 w-4 h-8 rounded-full z-20 border shadow-sm ${isVerified ? 'bg-blue-500 border-blue-600' : 'bg-yellow-400 border-yellow-500'}`}></div>
                
                {/* CARD CONTENT HEADER (Always Visible) */}
                <div 
                  className="p-6 cursor-pointer relative z-10"
                  onClick={() => toggleJob(job.id)}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="w-full">
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col items-start gap-1">
                           {isVerified ? (
                               <span className="bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                   <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                   Fonte Confirmada
                               </span>
                           ) : (
                               <span className="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider flex items-center gap-1 shadow-sm border border-yellow-200">
                                   <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                   Fonte Pendente
                               </span>
                           )}
                           <h3 className="text-xl md:text-2xl font-bold text-stone-800 font-typewriter group-hover:text-blue-900 transition-colors mt-1">
                            {job.title}
                           </h3>
                        </div>
                        <div className="flex flex-col items-end">
                            {job.postedAt && (
                            <span className="text-[10px] uppercase font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded whitespace-nowrap ml-2 mb-1">
                                {job.postedAt}
                            </span>
                            )}
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase font-bold text-stone-500 tracking-wide">
                                    {job.sourceInfo}
                                </span>
                                {job.url && (
                                    <span className="text-[8px] font-mono truncate max-w-[150px] text-stone-400">
                                        {new URL(job.url).hostname}
                                    </span>
                                )}
                            </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-stone-500 text-sm mt-2">
                        <span className="font-bold bg-stone-800 text-stone-50 px-2 py-1 rounded-sm uppercase text-xs tracking-wider shadow-sm flex items-center gap-2">
                          {job.company}
                        </span>
                        <span className="flex items-center gap-1">
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                           {job.location}
                        </span>
                      </div>
                      
                      {/* Tags Rápidas */}
                      <div className="flex flex-wrap gap-2 mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">
                        <span className="flex items-center gap-1 bg-stone-100 px-2 py-1 rounded border border-stone-200">
                          {job.type}
                        </span>
                        <span className="flex items-center gap-1 bg-stone-100 px-2 py-1 rounded border border-stone-200">
                          {job.contract}
                        </span>
                        {job.salary && job.salary !== "A combinar" && (
                            <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            {job.salary}
                            </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Match Score & Action */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0 ml-2">
                       <div className={`w-14 h-14 rounded-full border-4 flex flex-col items-center justify-center shadow-inner relative bg-white
                         ${job.matchScore >= 90 ? 'border-green-500 text-green-700' : 
                           job.matchScore >= 70 ? 'border-blue-500 text-blue-700' : 
                           'border-yellow-500 text-yellow-700'}`}
                       >
                         <span className="text-lg font-bold leading-none">{job.matchScore}</span>
                         <span className="text-[8px] uppercase font-bold opacity-60">Match</span>
                       </div>
                       <div className="text-xs text-stone-400 uppercase font-bold tracking-widest flex items-center gap-1 group-hover:text-stone-600">
                         {isExpanded ? 'Fechar' : 'Abrir'} 
                         <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                       </div>
                    </div>
                  </div>
                </div>

                {/* EXPANDED DETAILS (ACCORDION) */}
                <div 
                  className={`border-t-2 border-stone-200 border-dashed bg-[#FFFDF5] transition-all duration-500 ease-in-out overflow-hidden
                    ${isExpanded ? 'max-h-[800px] opacity-100 p-6' : 'max-h-0 opacity-0 p-0'}
                  `}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-typewriter text-sm text-stone-700">
                    
                    {/* Coluna 1: Resumo e Requisitos */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-bold text-stone-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                          Resumo do Caso
                        </h4>
                        <p className="leading-relaxed opacity-90">{job.summary}</p>
                      </div>

                      {job.requirements.length > 0 && (
                        <div>
                          <h4 className="font-bold text-stone-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                            Requisitos Críticos
                          </h4>
                          <ul className="list-disc list-inside space-y-1 opacity-90 marker:text-red-400">
                            {job.requirements.map((req, i) => (
                              <li key={i}>{req}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Coluna 2: Benefícios e Ação */}
                    <div className="space-y-6 flex flex-col justify-between">
                      <div>
                         <h4 className="font-bold text-stone-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path></svg>
                            Benefícios & Vantagens
                          </h4>
                          {job.benefits.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 opacity-90 marker:text-green-500">
                              {job.benefits.map((ben, i) => (
                                <li key={i}>{ben}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="italic opacity-60">Nenhum benefício específico listado publicamente.</p>
                          )}
                      </div>

                      <div className="pt-4 border-t border-stone-200 flex flex-col gap-3">
                        {/* BOTÃO PRINCIPAL: LINK DA IA */}
                        {job.url ? (
                            <a href={job.url} target="_blank" rel="noopener noreferrer" className={`w-full flex items-center justify-center gap-2 py-3 rounded-sm font-bold uppercase tracking-widest transition-colors shadow-lg ${isVerified ? 'bg-stone-800 text-white hover:bg-stone-700' : 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200'}`}>
                              <span>{isVerified ? 'Aplicar (Link Confirmado)' : 'Aplicar (Link a verificar)'}</span>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                            </a>
                          ) : (
                            <div className="w-full text-center py-3 bg-stone-100 text-stone-400 font-bold uppercase tracking-widest cursor-not-allowed">
                              Link Direto Indisponível
                            </div>
                          )}

                          {/* BOTÃO SECUNDÁRIO: BUSCA MANUAL (GOOGLE) */}
                          <a href={getGoogleSearchUrl(job)} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 py-2 rounded-sm font-bold uppercase tracking-widest text-xs border border-stone-300 text-stone-500 hover:bg-stone-200 hover:text-stone-700 transition-colors">
                              <span>Link Quebrado? Buscar Fonte</span>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                          </a>
                          
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
      
      {/* CONTROLE DE PAGINAÇÃO */}
      {jobs.length > itemsPerPage && (
         <div className="flex flex-col items-center mt-10 mb-4 gap-2">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => paginate(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-stone-300 rounded-sm text-stone-600 font-bold text-xs uppercase tracking-widest hover:border-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                    Anterior
                </button>
                
                <div className="font-typewriter text-xs text-stone-500 bg-stone-100 px-3 py-1 rounded border border-stone-200">
                    Pág. {currentPage} / {totalPages}
                </div>

                <button
                    onClick={() => paginate(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-stone-300 rounded-sm text-stone-600 font-bold text-xs uppercase tracking-widest hover:border-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                    Próxima
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
            </div>
         </div>
      )}

      {/* Estado vazio */}
      {hasSearched && jobs.length === 0 && !isLoading && !error && (
        <div className="mt-12 text-center opacity-70">
          <div className="text-6xl mb-4 grayscale opacity-50">🕸️</div>
          <h3 className="text-xl font-bold text-stone-500 uppercase tracking-widest">Nenhuma vaga encontrada</h3>
          <p className="font-typewriter text-sm mt-2 text-stone-400">A busca nos agregadores e ATS não retornou resultados.</p>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}