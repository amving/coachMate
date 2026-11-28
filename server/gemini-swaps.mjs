import { GoogleAuth } from 'google-auth-library';

const reasons = ['minutes', 'rotation', 'keeper'];
const prompt = `Je bent de wisselassistent van een jeugdcoach. Kies uitsluitend uit de aangeleverde, lokaal gevalideerde opties. Geef voorrang aan een eerlijke verdeling van speeltijd (lagere minuteGap), weeg daarna de rotatiescore en behoud van de huidige keeper. Gebruik alleen de opgegeven cijfers. Kies één korte uitleg via reason: minutes voor eindminuten ten opzichte van de streeftijden, rotation voor de rotatiescore, keeper voor het behouden van de huidige keeper. Kies keeper alleen als keepsKeeper waar is. Geef alleen de optie-ID (option) en reason terug.`;

export function swapPromptOptions(input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 3) return null;
  const options = [];
  for (const option of input) {
    if (!option || !Number.isInteger(option.id) || option.id < 1 || option.id > 3 || options.some(o => o.id === option.id) ||
        !Number.isFinite(option.minuteGap) || option.minuteGap < 0 || option.minuteGap > 120 ||
        !Number.isInteger(option.rotation) || option.rotation < 0 || option.rotation > 100 ||
        !Number.isInteger(option.swaps) || option.swaps < 0 || option.swaps > 11 || typeof option.keepsKeeper !== 'boolean') return null;
    options.push({ id: option.id, minuteGap: option.minuteGap, rotation: option.rotation, swaps: option.swaps, keepsKeeper: option.keepsKeeper });
  }
  return options;
}

export function createGeminiSwapAdvisor(project, auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })) {
  if (!/^[a-z][a-z0-9-]{5,29}$/.test(project ?? '')) return null;
  const url = `https://aiplatform.eu.rep.googleapis.com/v1/projects/${project}/locations/eu/publishers/google/models/gemini-3.1-flash-lite:generateContent`;
  return async options => {
    const safeOptions = swapPromptOptions(options);
    if (!safeOptions) return null;
    const controller = new AbortController();
    let timer;
    try {
      const deadline = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 4500); });
      const generate = async () => {
        const client = await auth.getClient();
        if (controller.signal.aborted) return null;
        const { data } = await client.request({ url, method: 'POST', signal: controller.signal, timeout: 4500, retry: false, data: {
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(safeOptions) }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 128, thinkingConfig: { thinkingLevel: 'MINIMAL' }, responseMimeType: 'application/json', responseSchema: {
            type: 'OBJECT', properties: { option: { type: 'STRING', enum: safeOptions.map(o => String(o.id)) }, reason: { type: 'STRING', enum: reasons } }, required: ['option', 'reason'],
          } },
        } });
        const candidate = data?.candidates?.[0];
        if (candidate?.finishReason !== 'STOP') return null;
        const result = JSON.parse(candidate.content.parts.filter(part => !part.thought).map(part => part.text).join(''));
        const choice = safeOptions.find(o => String(o.id) === result?.option);
        if (!choice || !reasons.includes(result.reason) || (result.reason === 'keeper' && !choice.keepsKeeper)) return null;
        return { option: choice.id, reason: result.reason };
      };
      return await Promise.race([generate(), deadline]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
