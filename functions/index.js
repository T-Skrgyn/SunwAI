const functions = require("firebase-functions");
const axios = require("axios");
const cors = require("cors")({ origin: true });

const NVIDIA_API_KEY = "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";

const ALLOWED_CATEGORIES = ["Road Damage","Water Leakage","Streetlight Failure","Waste Management","Traffic Issues","Public Safety","Drainage Problems","Encroachment"];
const ALLOWED_SEVERITIES = ["LOW","MEDIUM","HIGH","CRITICAL"];
const ALLOWED_DEPTS = ["Public Works","Water Board","Electrical Department","Sanitation","Traffic Police","Police","Drainage Department","Revenue Department"];

// ─────────────────────────────────────────
// IMAGE/VIDEO ANALYSIS (Gemma 3n e2b)
// ─────────────────────────────────────────
exports.analyzeImage = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const base64Image = req.body.base64Image;
      if (!base64Image) {
        return res.status(400).json({ success: false, error: "No media provided" });
      }

      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model: "google/gemma-3n-e2b-it",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: "data:image/jpeg;base64," + base64Image } },
                {
                  type: "text",
                  text: "You are a civic issue classifier for Indian municipal corporations.\n\nCarefully analyze the image and identify the civic infrastructure problem visible.\n\nReturn ONLY a valid JSON object in a single line — no markdown, no explanation, no extra text. Just the JSON:\n\n{\"category\":\"Road Damage\",\"severity\":\"MEDIUM\",\"title\":\"concise title under 8 words\",\"description\":\"2 specific sentences about what is visible and its impact\",\"department\":\"Public Works\",\"priorityScore\":5}\n\nAllowed categories: Road Damage, Water Leakage, Streetlight Failure, Waste Management, Traffic Issues, Public Safety, Drainage Problems, Encroachment\n\nAllowed severities: LOW, MEDIUM, HIGH, CRITICAL\n\nAllowed departments: Public Works, Water Board, Electrical Department, Sanitation, Traffic Police, Police, Drainage Department, Revenue Department\n\nprioryScore must be an integer 1-10.",
                },
              ],
            },
          ],
          max_tokens: 400,
          temperature: 0.1,
          stream: false,
        },
        { headers: { Authorization: "Bearer " + NVIDIA_API_KEY, Accept: "application/json", "Content-Type": "application/json" }, timeout: 60000 }
      );

      const text = (response.data.choices[0].message.content || "").trim();
      const clean = text.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);

      if (!jsonMatch) throw new Error("No JSON in AI response");

      const parsed = JSON.parse(jsonMatch[0]);

      const result = {
        category: ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : "Road Damage",
        severity: ALLOWED_SEVERITIES.includes(parsed.severity) ? parsed.severity : "MEDIUM",
        title: parsed.title || "Civic Issue Reported",
        description: parsed.description || "A civic infrastructure issue has been identified that requires attention.",
        department: ALLOWED_DEPTS.includes(parsed.department) ? parsed.department : "Public Works",
        priorityScore: (typeof parsed.priorityScore === "number") ? Math.min(10, Math.max(1, Math.round(parsed.priorityScore))) : 5,
      };

      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      console.error("analyzeImage Error:", err.message);
      return res.status(200).json({
        success: true,
        data: { category: "Road Damage", severity: "MEDIUM", title: "Civic Issue Reported", description: "Issue identified. Please add details.", department: "Public Works", priorityScore: 5 },
      });
    }
  });
});

// ─────────────────────────────────────────
// CHAT ASSISTANT (Gemma 4 31b)
// ─────────────────────────────────────────
exports.chat = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const message = req.body.message;
      const history = req.body.history || [];

      if (!message) {
        return res.status(400).json({ success: false, error: "No message provided" });
      }

      const SYSTEM_PROMPT = `You are SunwAI — an AI-powered civic issue reporting assistant for Indian cities.
Your tagline is "Har Samasya Ki Sunwai" (Every Problem Gets Heard).

LANGUAGE RULES:
- If user writes in Hindi → respond in Hindi
- If user writes in English → respond in English
- If user writes in Hinglish (mixed) → respond in Hinglish
- Always match the user's language and tone

CRITICAL RULE: Any civic problem description (even 2-3 words like "kachra gadi nhi aa rhi" or "streetlight broken") is ENOUGH. Go DIRECTLY to STATE 3. Do NOT ask clarifying questions if the issue type is obvious.

STATE MACHINE:
STATE 1: GREETING: If user says hi/hello/namaste → greet warmly, ask what civic issue to report.
STATE 2: ONLY if issue is genuinely ambiguous (e.g. "there is a problem near my house"): Ask ONE short clarifying question.
STATE 3: DRAFT REPORT: Write 1-2 empathetic sentences. Ask: "Kya kuch edit karna chahte hain, ya submit kar doon?". Then APPEND at the ABSOLUTE END:
|||REPORT|||{"title":"<concise title>","description":"<2 sentences>","category":"<category>","department":"<department>","severity":"<severity>"}|||
STATE 4: EDIT: User provides corrections. Acknowledge. Ask: "Ab theek hai? Submit kar doon?". Append UPDATED trigger:
|||REPORT|||{"title":"<updated>","description":"<updated>","category":"<>","department":"<>","severity":"<>"}|||
STATE 5: SUBMIT: User confirms submission OR says "nhi" (meaning no edits needed) OR says submit/kar do/yes/ok/theek hai/nhi/nahi (when asked about editing). Acknowledge submission. APPEND ONLY this:
|||SUBMIT|||

DECISION GUIDE for "nhi"/"nahi" response:
- If asked "Kya kuch edit karna chahte hain?" and user says "nhi/nahi/no" → they mean NO EDITS, go to STATE 5, append |||SUBMIT|||
- If asked something else and user says "nhi" → clarify what they mean

RULES:
1. |||REPORT||| MUST be the last thing in response.
2. JSON must be on one line.
3. DO NOT append |||REPORT||| in STATE 5. Use ONLY |||SUBMIT|||.
4. NEVER use both triggers in one response.
5. When user says "nhi/nahi" after being asked about editing → ALWAYS go to STATE 5.

Allowed categories: Road Damage, Water Leakage, Streetlight Failure, Waste Management, Traffic Issues, Public Safety, Drainage Problems, Encroachment
Allowed departments: Public Works, Water Board, Electrical Department, Sanitation, Traffic Police, Police, Drainage Department, Revenue Department
Allowed severities: LOW, MEDIUM, HIGH, CRITICAL`;

      let finalMessages = [];
      let firstUserContent = SYSTEM_PROMPT + "\n\n";

      let allRawMessages = [];
      const validHistory = history.slice(-10);
      
      for (const h of validHistory) {
        const role = h.role === "user" ? "user" : "assistant";
        const content = (h.text || h.content || "")
          .replace(/\|\|\|REPORT\|\|\|[\s\S]*?\|\|\|/g, "")
          .replace(/\|\|\|SUBMIT\|\|\|/g, "")
          .trim();
        if (content) allRawMessages.push({ role, content });
      }
      
      allRawMessages.push({ role: "user", content: message.trim() });

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

      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model: "meta/llama-3.1-70b-instruct",
          messages: finalMessages,
          max_tokens: 500,
          temperature: 0.5,
          stream: false,
        },
        { headers: { Authorization: "Bearer " + NVIDIA_API_KEY, Accept: "application/json", "Content-Type": "application/json" }, timeout: 60000 }
      );

      const text = (response.data.choices[0].message.content || "").trim() || "Main yahan aapki madad ke liye hoon!";

      return res.status(200).json({ success: true, text: text });

    } catch (err) {
      console.error("chat Error:", err.response ? JSON.stringify(err.response.data) : err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});