import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente baseadas no modo (development/production)
  // O terceiro parâmetro '' garante que carregue TODAS as variáveis, não apenas as com prefixo VITE_
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    define: {
      // Substitui process.env.API_KEY pelo valor literal da string durante o build.
      // Isso é CRÍTICO para Vercel/Netlify.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ""),
      
      // Polyfill simples para evitar "Uncaught ReferenceError: process is not defined"
      // caso alguma biblioteca tente acessar process.env.NODE_ENV diretamente
      'process.env': {
        NODE_ENV: JSON.stringify(mode)
      }
    }
  }
})