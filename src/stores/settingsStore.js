/**
 * Settings Store
 *
 * Manages application settings including LLM provider configuration
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

;                                                                      

;                                   
                  
               
                      
                                         
                       
 

export const LLM_PROVIDERS                      = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude models - excellent at structured extraction',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (faster)' },
    ],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    description: 'GPT models - widely used and capable',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (faster)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ],
    defaultModel: 'gpt-4o',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    description: 'Gemini models - strong reasoning capabilities',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (faster)' },
    ],
    defaultModel: 'gemini-1.5-pro',
  },
  {
    id: 'custom',
    name: 'Custom / Local LLM',
    description: 'Self-hosted or custom API endpoint (OpenAI-compatible)',
    models: [
      { id: 'custom', name: 'Custom Model' },
    ],
    defaultModel: 'custom',
  },
];

;                        
                      
                                
                        
                                       

                             
                           
                             

                       
                     

                              
                                                                                                     
                     

                                         
                          

            
                                                       
                                            
                                                          
                                             
                                                
                                       
                                           
                                       

                  
                                            
                          

            
                                
                                             
                                                                                   
 

export const useSettingsStore = create               ()(
  persist(
    (set, get) => ({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-20250514',
      apiKeys: {
        anthropic: '',
        openai: '',
        google: '',
        custom: '',
      },
      customLlmBaseUrl: 'http://localhost:11434/v1',
      customLlmModelName: 'llama2',
      vsacApiKey: '',
      useBackendApi: false,
      backendUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000', // Backend runs on 8000; Vite proxies /api
      anthropicApiKey: '', // Legacy

      setSelectedProvider: (provider) => {
        const providerConfig = LLM_PROVIDERS.find(p => p.id === provider);
        set({
          selectedProvider: provider,
          selectedModel: provider === 'custom' ? get().customLlmModelName : (providerConfig?.defaultModel || '')
        });
      },

      setSelectedModel: (model) => set({ selectedModel: model }),

      setApiKey: (provider, key) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
          // Keep legacy anthropicApiKey in sync
          ...(provider === 'anthropic' ? { anthropicApiKey: key } : {}),
        }));
      },

      setCustomLlmBaseUrl: (url) => set({ customLlmBaseUrl: url }),
      setCustomLlmModelName: (name) => set({ customLlmModelName: name, selectedModel: name }),
      setVsacApiKey: (key) => set({ vsacApiKey: key }),
      setUseBackendApi: (use) => set({ useBackendApi: use }),
      setBackendUrl: (url) => set({ backendUrl: url }),

      // Legacy actions for backwards compatibility
      setAnthropicApiKey: (key) => {
        set((state) => ({
          anthropicApiKey: key,
          apiKeys: { ...state.apiKeys, anthropic: key },
        }));
      },

      clearApiKey: () => {
        const provider = get().selectedProvider;
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: '' },
          ...(provider === 'anthropic' ? { anthropicApiKey: '' } : {}),
        }));
      },

      getActiveApiKey: () => {
        const state = get();
        return state.apiKeys[state.selectedProvider] || '';
      },

      getActiveProvider: () => {
        const state = get();
        return LLM_PROVIDERS.find(p => p.id === state.selectedProvider) || LLM_PROVIDERS[0];
      },

      getCustomLlmConfig: () => {
        const state = get();
        return {
          baseUrl: state.customLlmBaseUrl,
          modelName: state.customLlmModelName,
          apiKey: state.apiKeys.custom || '',
        };
      },
    }),
    {
      name: 'measure-accelerator-settings',
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        apiKeys: state.apiKeys,
        customLlmBaseUrl: state.customLlmBaseUrl,
        customLlmModelName: state.customLlmModelName,
        vsacApiKey: state.vsacApiKey,
        useBackendApi: state.useBackendApi,
        backendUrl: state.backendUrl,
        anthropicApiKey: state.anthropicApiKey,
      }),
      // Migration to handle old data format
      migrate: (persistedState     , _version        ) => {
        // Ensure apiKeys has the custom field
        const apiKeys = persistedState.apiKeys || {};
        if (!apiKeys.custom) {
          apiKeys.custom = '';
        }
        if (persistedState.anthropicApiKey && !apiKeys.anthropic) {
          apiKeys.anthropic = persistedState.anthropicApiKey;
        }
        return {
          ...persistedState,
          apiKeys,
          customLlmBaseUrl: persistedState.customLlmBaseUrl || 'http://localhost:11434/v1',
          customLlmModelName: persistedState.customLlmModelName || 'llama2',
        };
      },
      version: 2,
    }
  )
);
