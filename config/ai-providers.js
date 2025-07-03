const { generateText, streamText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const axios = require('axios');

// AI Provider Configuration
const AI_CONFIG = {
  together: {
    apiKey: process.env.TOGETHER_API_KEY,
    baseUrl: 'https://api.together.xyz/v1',
    model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    enabled: !!process.env.TOGETHER_API_KEY
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    enabled: !!process.env.OPENAI_API_KEY
  }
};

// Custom Together AI function using direct API calls
async function generateTextWithTogether(options) {
  const { messages, tools, maxSteps = 5 } = options;
  
  try {
    console.log('🤖 Trying Together AI...');
    
    // Convert tools to Together AI format if needed
    const togetherMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await axios.post(`${AI_CONFIG.together.baseUrl}/chat/completions`, {
      model: AI_CONFIG.together.model,
      messages: togetherMessages,
      max_tokens: 1000,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${AI_CONFIG.together.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const text = response.data.choices[0].message.content;
    
    console.log('✅ Together AI succeeded!');
    return {
      text,
      steps: [], // Together AI doesn't support tools in this simple integration
      finishReason: 'stop',
      usage: response.data.usage,
      provider: 'together'
    };

  } catch (error) {
    console.log('❌ Together AI failed:', error.response?.data || error.message);
    throw error;
  }
}

// Smart AI Provider that tries Together AI first, then OpenAI
class SmartAIProvider {
  constructor() {
    this.providers = [];
    
    // Add Together AI if available
    if (AI_CONFIG.together.enabled) {
      this.providers.push('together');
      console.log('🔗 Together AI provider available');
    }
    
    // Add OpenAI if available  
    if (AI_CONFIG.openai.enabled) {
      this.providers.push('openai');
      console.log('🔗 OpenAI provider available');
    }

    if (this.providers.length === 0) {
      throw new Error('No AI providers available! Please check your API keys.');
    }

    console.log(`🤖 AI Providers loaded: ${this.providers.join(', ')}`);
  }

  async generateText(options) {
    const { messages, tools, maxSteps = 5 } = options;
    
    // Try each provider in order
    for (const provider of this.providers) {
      try {
        if (provider === 'together') {
          // For Together AI, if we have tools, fall back to OpenAI immediately
          if (tools && Object.keys(tools).length > 0) {
            console.log('🔧 Tools detected - skipping Together AI, using OpenAI for tool support');
            continue;
          }
          
          return await generateTextWithTogether(options);
          
        } else if (provider === 'openai') {
          console.log('🤖 Using OpenAI...');
          
          const result = await generateText({
            model: openai(AI_CONFIG.openai.model),
            tools,
            maxSteps,
            messages
          });
          
          console.log('✅ OpenAI succeeded!');
          return {
            ...result,
            provider: 'openai'
          };
        }
        
      } catch (error) {
        console.log(`❌ ${provider} failed:`, error.message);
        
        // If this was the last provider, throw the error
        if (provider === this.providers[this.providers.length - 1]) {
          throw error;
        }
        
        // Otherwise, continue to next provider
        console.log(`🔄 Falling back to next provider...`);
      }
    }
    
    throw new Error('All AI providers failed');
  }

  async streamText(options) {
    const { messages, tools, maxSteps = 5 } = options;
    
    // For streaming, we'll prefer OpenAI since it has better streaming support
    if (this.providers.includes('openai')) {
      console.log('📡 Using OpenAI for streaming...');
      
      try {
        const stream = streamText({
          model: openai(AI_CONFIG.openai.model),
          tools,
          maxSteps,
          messages
        });
        
        return {
          ...stream,
          provider: 'openai'
        };
        
      } catch (error) {
        console.log('❌ OpenAI streaming failed:', error.message);
        throw error;
      }
    }
    
    // If only Together AI is available, return a basic stream
    if (this.providers.includes('together')) {
      console.log('📡 Using Together AI for streaming (basic)...');
      
      try {
        const result = await this.generateText(options);
        
        // Create a simple async generator that yields the text
        const textStream = (async function* () {
          const words = result.text.split(' ');
          for (const word of words) {
            yield word + ' ';
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for streaming effect
          }
        })();
        
        return {
          textStream,
          provider: 'together'
        };
        
      } catch (error) {
        console.log('❌ Together AI streaming failed:', error.message);
        throw error;
      }
    }
    
    throw new Error('No streaming providers available');
  }

  getActiveProvider() {
    return this.providers[0] || 'none';
  }

  getConfig() {
    return {
      together: {
        enabled: AI_CONFIG.together.enabled,
        model: AI_CONFIG.together.model
      },
      openai: {
        enabled: AI_CONFIG.openai.enabled,
        model: AI_CONFIG.openai.model
      },
      activeProviders: this.providers
    };
  }
}

// Export singleton instance
const smartAI = new SmartAIProvider();

module.exports = {
  smartAI,
  AI_CONFIG
}; 