// 2nd Gen Cloud Run URLs (from firebase deploy output)
const PROD_URLS = {
  chat:         "https://chat-756rd5ly3q-uc.a.run.app",
  analyzeImage: "https://analyzeimage-756rd5ly3q-uc.a.run.app",
};
const EMULATOR_BASE = "http://127.0.0.1:5001/sunwai-cee55/us-central1";
const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === "true";

function getUrl(fn: "chat" | "analyzeImage"): string {
  return USE_EMULATOR ? `${EMULATOR_BASE}/${fn}` : PROD_URLS[fn];
}


// ─────────────────────────────────────────
// IMAGE/VIDEO ANALYSIS
// ─────────────────────────────────────────
export async function analyzeIssueImage(base64Image: string): Promise<{
  category: string;
  severity: string;
  title: string;
  description: string;
  department: string;
  priorityScore: number;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(getUrl("analyzeImage"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Image }), signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  } catch (err) {
    console.warn("Cloud fallback to direct NVIDIA:", err);
  }

  // Firebase Functions unavailable — return safe defaults so user can still submit manually
  return {
    category: "Road Damage", severity: "MEDIUM",
    title: "Civic Issue Reported", description: "Issue identified from media. Please review and edit before submitting.",
    department: "Public Works", priorityScore: 5,
  };
}

// ─────────────────────────────────────────
// CHAT ASSISTANT
// ─────────────────────────────────────────
export async function chatWithAssistant(
  message: string,
  history: { role: string; text: string }[]
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(getUrl("chat"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }), signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.text;
  } catch (err) {
    console.warn("Cloud fallback to direct NVIDIA:", err);
  }

  const SYSTEM_PROMPT = `You are SunwAI — a civic issue reporting assistant for Indian cities. Tagline: "Har Samasya Ki Sunwai".

LANGUAGE: Always match user language (Hindi/English/Hinglish).

CRITICAL RULE: Any civic problem description (even 2-3 words like "kachra gadi nhi aa rhi" or "streetlight broken") is ENOUGH. Go DIRECTLY to STATE 3. Do NOT ask clarifying questions if the issue type is obvious.

STATE MACHINE:
STATE 1 — GREETING: User says hi/hello/namaste → greet warmly, ask what issue to report.
STATE 2 — ONLY if genuinely ambiguous (e.g. "there is a problem near my house"): Ask ONE short clarifying question.
STATE 3 — DRAFT (go here immediately when issue type is clear): Write 1-2 empathetic sentences. Ask: "Kya kuch edit karna chahte hain, ya submit kar doon?" Then APPEND at ABSOLUTE END:
|||REPORT|||{"title":"<concise title under 8 words>","description":"<2 specific sentences>","category":"<category>","department":"<department>","severity":"<severity>"}|||
STATE 4 — EDIT: User wants changes → update and re-confirm. Append updated |||REPORT|||{...}|||
STATE 5 — SUBMIT: User says submit/yes/ok/kar do/theek hai → confirm submitted. Append ONLY:
|||SUBMIT|||

RULES:
1. |||REPORT||| MUST be the very last thing in the response.
2. JSON must be on ONE line, no line breaks inside it.
3. In STATE 5: use ONLY |||SUBMIT|||, never |||REPORT|||.
4. NEVER output |||SUBMIT||| unless user explicitly confirmed submission.

Allowed categories: Road Damage, Water Leakage, Streetlight Failure, Waste Management, Traffic Issues, Public Safety, Drainage Problems, Encroachment
Allowed departments: Public Works, Water Board, Electrical Department, Sanitation, Traffic Police, Police, Drainage Department, Revenue Department
Allowed severities: LOW, MEDIUM, HIGH, CRITICAL`;

  let finalMessages: any[] = [];
  let firstUserContent = SYSTEM_PROMPT + "\n\n";

  let allRawMessages = [];
  const validHistory = history.slice(-8);
  for (const h of validHistory) {
    const role = h.role === "user" ? "user" : "assistant";
    const content = (h.text || "").replace(/\|\|\|REPORT\|\|\|[\s\S]*?\|\|\|/g, "").replace(/\|\|\|SUBMIT\|\|\|/g, "").trim();
    if (content) allRawMessages.push({ role, content });
  }
  allRawMessages.push({ role: "user", content: message.trim() });

  // Bulletproof array builder
  for (const msg of allRawMessages) {
    if (finalMessages.length === 0) {
      if (msg.role === "user") {
        finalMessages.push({ role: "user", content: firstUserContent + "User Message: " + msg.content });
      } else {
        finalMessages.push({ role: "user", content: firstUserContent + "Namaste!" });
        finalMessages.push({ role: "assistant", content: msg.content });
      }
    } else {
      if (finalMessages[finalMessages.length - 1].role === msg.role) {
        finalMessages[finalMessages.length - 1].content += "\n\n" + msg.content;
      } else {
        finalMessages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Direct NVIDIA calls are CORS-blocked from browser — Firebase Functions must be deployed
  throw new Error("Firebase Functions unavailable. Please deploy with: firebase deploy --only functions");
}

// ─────────────────────────────────────────
// MEDIA PROCESSING (Images & Video Keyframes)
// ─────────────────────────────────────────
export function processMediaToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    
    // IF IT'S A VIDEO: Extract a frame
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = url;
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      
      video.onloadeddata = () => {
        // Jump to 25% into the video to skip black intro screens
        video.currentTime = video.duration * 0.25; 
      };

      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const MAX = 800;
        let w = video.videoWidth; 
        let h = video.videoHeight;
        
        if (w > MAX) { h = (h * MAX) / w; w = MAX; }
        if (h > MAX) { w = (w * MAX) / h; h = MAX; }
        
        canvas.width = w; 
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        
        const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
        URL.revokeObjectURL(url);
        resolve(base64);
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to process video file."));
      };

    } else {
      // IF IT'S AN IMAGE: Compress normally
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      
      img.onload = () => {
        const MAX = 800;
        let w = img.width; 
        let h = img.height;
        if (w > MAX) { h = (h * MAX) / w; w = MAX; }
        if (h > MAX) { w = (w * MAX) / h; h = MAX; }
        canvas.width = w; 
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
        URL.revokeObjectURL(url);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = url;
    }
  });
}