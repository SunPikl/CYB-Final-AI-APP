// popup.js (Hardened + safe)
// ------------------------------------------------------
function updateUI(statusText, messageHtml) {
    const responseDiv = document.getElementById("response");
    if (!responseDiv) {
        console.warn("updateUI: #response element not found.");
        return;
    }

    let color = "gray";
    if (statusText.includes("DANGER")) color = "red";
    else if (statusText.includes("WARNING")) color = "orange";
    else if (statusText.includes("SAFE")) color = "green";

    responseDiv.innerHTML = `
        <h2>Final Safety Rating: <span style="color: ${color};">${statusText}</span></h2>
        <div style="margin-bottom: 15px;">${messageHtml}</div>
        <p style="font-size: 0.8em; color: #666;"><em>(Powered by Gemini & VirusTotal)</em></p>
    `;
}

// ------------------------------------------------------
// Read API keys from api_keys.txt
// ------------------------------------------------------
async function loadApiKeys() {
    try {
        const res = await fetch(chrome.runtime.getURL("api_keys.txt"));
        const txt = await res.text();

        const lines = txt
            .split("\n")
            .map(l => l.trim())
            .filter(Boolean);

        return {
            gemini: lines[0] || "",
            virustotal: lines[1] || ""
        };
    } catch (err) {
        console.error("Failed to load api_keys.txt:", err);
        return { gemini: "", virustotal: "" };
    }
}

// ------------------------------------------------------
// Wait for DOM then wire things up
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    console.info("popup: DOMContentLoaded");

    const askBtn = document.getElementById("ask");
    const promptInput = document.getElementById("prompt");
    const responseDiv = document.getElementById("response");

    if (!askBtn || !promptInput || !responseDiv) {
        console.error("popup: Required DOM elements missing.");
        if (responseDiv) {
            responseDiv.innerHTML = "<strong>Popup initialization error:</strong> missing DOM elements.";
        }
        return;
    }

    // Load API keys first
    const { gemini: geminiApiKey, virustotal: virusTotalApiKey } = await loadApiKeys();

    if (!geminiApiKey || !virusTotalApiKey) {
        updateUI("API KEY ERROR", "api_keys.txt missing or invalid. Ensure line 1 = Gemini, line 2 = VirusTotal.");
        return;
    }

    const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    // Autofill URL
    async function getCurrentTabUrl() {
        try {
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && !tab.url.startsWith("chrome:")) {
                promptInput.value = tab.url;
            } else {
                promptInput.placeholder = "Enter URL (e.g., example.com)";
            }
        } catch (err) {
            console.warn("getCurrentTabUrl error:", err);
            promptInput.placeholder = "Enter URL (e.g., example.com)";
        }
    }
    getCurrentTabUrl();

    // Click handler
    askBtn.addEventListener("click", async () => {
        const websiteUrl = promptInput.value.trim();
        if (!websiteUrl || websiteUrl.startsWith("chrome:")) {
            updateUI("INVALID URL", "Please enter a valid website to check.");
            return;
        }

        updateUI("CHECKING...", "Contacting VirusTotal and Gemini...");

        // ------------------------------------------------------
        // VirusTotal
        // ------------------------------------------------------
        let vtTextSummary = "No VirusTotal data available.";
        let vtHtmlOutput = "";

        try {
            const urlId = btoa(websiteUrl)
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

            const vtRes = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
                method: "GET",
                headers: {
                    accept: "application/json",
                    "x-apikey": virusTotalApiKey
                }
            });

            if (!vtRes.ok) {
                if (vtRes.status === 404) {
                    vtTextSummary = "URL not found in VirusTotal database.";
                    vtHtmlOutput =
                        `<div style="background:#f9f9f9;padding:10px;border-left:4px solid gray;">
                        ℹ️ VirusTotal: URL not scanned before.</div>`;
                } else {
                    vtTextSummary = `VirusTotal error: ${vtRes.status}`;
                    vtHtmlOutput =
                        `<div style="color:orange;">VirusTotal error: ${vtRes.status}</div>`;
                }
            } else {
                const vtData = await vtRes.json();
                const stats = vtData.data?.attributes?.last_analysis_stats || {};
                const results = vtData.data?.attributes?.last_analysis_results || {};

                const maliciousCount = stats.malicious || 0;
                const suspiciousCount = stats.suspicious || 0;

                if (maliciousCount > 0) {
                    const badVendors = Object.entries(results)
                        .filter(([_, d]) =>
                            d.category === "malicious" || d.category === "suspicious")
                        .map(([vendor, d]) => `${vendor}: ${d.result}`);

                    vtTextSummary =
                        `Malicious: ${maliciousCount}. Suspicious: ${suspiciousCount}. Vendors: ${badVendors.join(", ")}`;

                    vtHtmlOutput =
                        `<div style="background:#fff0f0;padding:10px;border-left:4px solid red;">
                        <strong>⚠️ VirusTotal Detections (${maliciousCount})</strong><br>${badVendors.join("<br>")}
                        </div>`;
                } else {
                    vtTextSummary = "VirusTotal reports 0 malicious detections.";
                    vtHtmlOutput =
                        `<div style="background:#f0fff4;padding:10px;border-left:4px solid green;">
                        <strong>✅ VirusTotal Clean:</strong> No malicious reports.</div>`;
                }
            }

        } catch (err) {
            console.error("VirusTotal fetch error:", err);
            vtTextSummary = "VirusTotal lookup failed.";
            vtHtmlOutput =
                `<div style="color:orange;">VirusTotal connection error.</div>`;
        }

        updateUI("ANALYZING...", `${vtHtmlOutput}<br>Gemini is analyzing...`);

        // ------------------------------------------------------
        // Gemini prompt
        // ------------------------------------------------------
        const systemPrompt = `You are a website safety analyst.
Your response MUST begin with one rating on the first line: HIGH DANGER, MEDIUM WARNING, or SAFE.
Then provide a short summary and bullet points.
No bold text. No special formatting. Plain text only.`;

        const userPrompt = `Perform a simple, clear web search for security risks linked to: ${websiteUrl}

Include:
1) Malware or phishing reports
2) Major data breaches or incidents
3) Consistent scam reports
4) Recent security news or blog findings

VirusTotal summary:
${vtTextSummary}

If Fortinet, BitDefender, or VIPRE report issues, classify severity as high.

Output format:
Summary of Findings:
Short, easy-to-read summary (max 100 words)

Evidence:
-- title reason: short explanation
Provide at least 4 bullet points.
Use 10 words max for SAFE-site explanations.`;

        const mergedPrompt = `${systemPrompt}\n\n${userPrompt}`;

        let geminiText = "";
        try {
            const body = {
                contents: [
                    { parts: [{ text: mergedPrompt }] }
                ]
            };

            const res = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Gemini non-ok:", res.status, text);
                updateUI("API ERROR", vtHtmlOutput + `<br>Gemini error: ${res.status}`);
                return;
            }

            const data = await res.json().catch(e => {
                console.error("Parsing Gemini JSON failed:", e);
                return null;
            });

            geminiText =
                data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
                || "No response.";

        } catch (err) {
            console.error("Gemini network error:", err);
            updateUI("NETWORK ERROR", vtHtmlOutput + "<br>Gemini failed to respond.");
            return;
        }

        // ------------------------------------------------------
        // Rating extraction
        // ------------------------------------------------------
        let rating = "UNKNOWN";
        const firstLine = geminiText.split("\n")[0].toUpperCase();

        if (firstLine.startsWith("HIGH DANGER")) rating = "HIGH DANGER";
        else if (firstLine.startsWith("MEDIUM WARNING")) rating = "MEDIUM WARNING";
        else if (firstLine.startsWith("SAFE")) rating = "SAFE";

        const finalHtml = `${vtHtmlOutput}<hr>${geminiText}`;
        updateUI(rating, finalHtml);
    });
});
