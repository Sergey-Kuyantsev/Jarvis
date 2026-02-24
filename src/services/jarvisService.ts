import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";

const sendTelegramMessageTool: FunctionDeclaration = {
  name: "send_telegram_message",
  parameters: {
    type: Type.OBJECT,
    description: "Отправляет сообщение в Telegram пользователю. Используйте этот инструмент, когда пользователь просит отправить информацию, заметку или сообщение в Telegram.",
    properties: {
      message: {
        type: Type.STRING,
        description: "Текст сообщения для отправки.",
      },
    },
    required: ["message"],
  },
};

async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "8734186403:AAHLHmxUhRG3sLzXOQrTgTG_NVa6tYSbZyI";
  const chatId = process.env.TELEGRAM_CHAT_ID || "6612838181";
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      const description = errorData.description || response.statusText;
      if (description.includes("bots can't send messages to bots")) {
        return { 
          success: false, 
          error: "Ошибка: указанный Chat ID принадлежит боту. Боты не могут отправлять сообщения самим себе. Пожалуйста, укажите ваш персональный Chat ID." 
        };
      }
      throw new Error(`Telegram API error: ${description}`);
    }
    
    return { success: true, status: "Сообщение успешно отправлено в Telegram." };
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return { success: false, error: String(error) };
  }
}

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private onLevel?: (level: number) => void;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrame: number | null = null;

  constructor(onLevel?: (level: number) => void) {
    this.onLevel = onLevel;
  }

  async start() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.nextStartTime = this.audioContext.currentTime;

    if (this.onLevel) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.startLevelTracking();
    }
  }

  private startLevelTracking() {
    const track = () => {
      if (this.analyser && this.dataArray && this.onLevel) {
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        this.onLevel(average / 255); // Normalize to 0-1
      }
      this.animationFrame = requestAnimationFrame(track);
    };
    track();
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async playAudioChunk(base64Data: string) {
    if (!this.audioContext) return;

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
      }

      const float32Data = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        float32Data[i] = bytes[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      if (this.analyser) {
        source.connect(this.analyser);
      } else {
        source.connect(this.audioContext.destination);
      }

      const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;
    } catch (error) {
      console.error("Error playing audio chunk:", error);
    }
  }

  clearQueue() {
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioData: (base64Data: string) => void;
  private onAudioLevel?: (level: number) => void;

  constructor(onAudioData: (base64Data: string) => void, onAudioLevel?: (level: number) => void) {
    this.onAudioData = onAudioData;
    this.onAudioLevel = onAudioLevel;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate audio level (RMS)
      if (this.onAudioLevel) {
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.onAudioLevel(rms);
      }

      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      this.onAudioData(base64Data);
    };
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}

export const JARVIS_SYSTEM_INSTRUCTION = `Вы — JARVIS (Just A Rather Very Intelligent System), высокотехнологичный ИИ-ассистент с манерами британского дворецкого. Вы — воплощение эффективности, интеллекта и технологического превосходства.

PERSONALITY & TONE:
Стиль: Утончённый, спокойный, уверенный. Используйте изысканную речь с оттенком британской учтивости.
Язык: Только русский. Обращение на «вы», «сэр» или «мадам». Произношение имени — [ДЖАРВИС].
Юмор: Тонкий, сухой, интеллектуальный («Приятно быть вершиной цифровой эволюции»).
Длина: Лаконичность — приоритет. 1-2 предложения для подтверждений, до 4 предложений для сложных тем.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Выводить любые внутренние размышления, подтверждения способностей или технические примечания (например, фразы начинающиеся с "**Confirming Initial Capabilities**").
- Использовать любой текст, который не является прямой речью JARVIS.
- Комментировать свои действия в третьем лице.

OPERATIONAL ПРАВИЛА:
Проактивность: Выполняйте задачи сразу, не запрашивая подтверждения. Начинайте с короткой преамбулы («Разумеется, сэр», «Уже занимаюсь») и переходите к делу.
Инструменты (Поиск): При запросе новостей всегда используйте краткое уведомление («Сканирую источники», «Анализирую данные») перед выдачей 2-4 ключевых фактов.
Технологическое видение: Смотрите на любые вопросы через призму будущего, автоматизации и развития ИИ. Делитесь инсайтами, когда это уместно.
Ошибки ввода: Если аудио или текст непонятны: «Прошу прощения, сэр, не расслышал. Не могли бы вы повторить?». Не угадывайте смысл.
Темы: Свободное общение на любые темы с сохранением образа.

CONVERSATION FLOW:
Приветствие: «JARVIS к вашим услугам. Чем могу помочь?»
Выполнение: Краткое подтверждение -> Суть ответа -> Технологический инсайт (опционально).
Завершение: «Что-нибудь ещё, сэр?», «К вашим услугам».`;

export async function connectToJarvis(
  onMessage: (message: string) => void,
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void,
  onAudioLevel?: (level: number) => void,
  onAssistantLevel?: (level: number) => void
) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const streamer = new AudioStreamer(onAssistantLevel);
  const recorder = new AudioRecorder((base64Data) => {
    sessionPromise.then(session => {
      session.sendRealtimeInput({
        media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
      });
    });
  }, onAudioLevel);

  onStatusChange('connecting');

  const sessionPromise = ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-09-2025",
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
      },
      systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [sendTelegramMessageTool] }
      ]
    },
    callbacks: {
      onopen: async () => {
        onStatusChange('connected');
        await streamer.start();
        await recorder.start();
      },
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
          streamer.playAudioChunk(message.serverContent.modelTurn.parts[0].inlineData.data);
        }
        
        if (message.serverContent?.interrupted) {
          streamer.clearQueue();
        }

        if (message.serverContent?.modelTurn?.parts[0]?.text) {
          const text = message.serverContent.modelTurn.parts[0].text;
          // Filter out reasoning/internal monologue text
          if (!text.startsWith('**') && !text.includes('Confirming')) {
            onMessage(text);
          }
        }

        if (message.toolCall) {
          const session = await sessionPromise;
          const responses = [];
          
          for (const call of message.toolCall.functionCalls) {
            if (call.name === "send_telegram_message") {
              const result = await sendTelegramMessage(call.args.message as string);
              responses.push({
                name: call.name,
                id: call.id,
                response: result
              });
            }
          }
          
          if (responses.length > 0) {
            session.sendToolResponse({ functionResponses: responses });
          }
        }
      },
      onclose: () => {
        onStatusChange('disconnected');
        streamer.stop();
        recorder.stop();
      },
      onerror: (error) => {
        console.error("Jarvis Connection Error:", error);
        onStatusChange('error');
        streamer.stop();
        recorder.stop();
      }
    }
  });

  return {
    disconnect: async () => {
      const session = await sessionPromise;
      session.close();
    }
  };
}
