// A simple function to update the UI with a status and message
function updateUI(statusText, messageHtml) {
    const responseDiv = document.getElementById("response");
    let color = 'gray';

    if (statusText.includes('DANGER')) {
        color = 'red';
    } else if (statusText.includes('WARNING')) {
        color = 'orange';
    } else if (statusText.includes('SAFE')) {
        color = 'green';
    }

    responseDiv.innerHTML = `
        <h2>Final Safety Rating: <span style="color: ${color};">${statusText}</span></h2>
        <div style="margin-bottom: 15px;">${messageHtml}</div>
        <p style="font-size: 0.8em; color: #666;"><em>(Powered by Gemini & VirusTotal)</em></p>
    `;
}

// Function to get the current tab's URL and populate the input field
async function getCurrentTabUrl() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const inputField = document.getElementById("prompt");

    if (tab && tab.url && !tab.url.startsWith('chrome:')) {
        inputField.value = tab.url;
    } else {
        inputField.placeholder = "Enter URL (e.g., example.com)";
    }
}

// Run the function immediately when the script loads
getCurrentTabUrl();

// ----------------------------------------------------------------------
// MAIN LOGIC (VirusTotal + Gemini)
// ----------------------------------------------------------------------

document.getElementById("ask").addEventListener("click", async () => {
    const websiteUrl = document.getElementById("prompt").value.trim();
    const responseDiv = document.getElementById("response");

    // 🚨 KEYS: Insert your keys here
    const geminiApiKey = ""; 
    const virusTotalApiKey = ""; 

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    // --- 1. Immediate Pre-Flight Checks ---
    if (!geminiApiKey) {
        updateUI("API KEY ERROR", "<strong>Gemini API Key Missing.</strong> Please check your code.");
        return;
    }
    
    if (!websiteUrl || websiteUrl.length < 5 || websiteUrl.startsWith('chrome:')) {
        updateUI("INVALID URL", "Please enter a valid URL (e.g., example.com) to analyze.");
        return;
    }

    // Set initial loading message
    updateUI("CHECKING...", "Contacting VirusTotal and Gemini...");

    // --- 2. VirusTotal Call (Runs BEFORE Gemini) ---
    // --- 2. VIRUSTOTAL CALL (Lookup Mode) ---
    let vtReportHtml = "";

    try {
        if (virusTotalApiKey) {
            // A. Create the VirusTotal "URL Identifier"
            // (Base64 encode the URL, remove padding '=', replace '+' with '-', replace '/' with '_')
            const urlId = btoa(websiteUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const vtOptions = {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'x-apikey': virusTotalApiKey
                }
            };

            // B. Fetch the EXISTING report
            const vtRes = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, vtOptions);

            if (vtRes.ok) {
                const vtData = await vtRes.json();
                const stats = vtData.data.attributes.last_analysis_stats;
                const results = vtData.data.attributes.last_analysis_results;

                // C. Check if any vendors flagged it
                if (stats.malicious > 0 || stats.suspicious > 0) {
                    // Filter the specific vendors who said it was bad
                    let badVendors = [];
                    for (const [vendor, details] of Object.entries(results)) {
                        if (details.category === 'malicious' || details.category === 'suspicious') {
                            badVendors.push(`<span style="color:red; font-weight:bold;">${vendor}:</span> ${details.result}`);
                        }
                    }

                    // Display the list of vendors
                    vtReportHtml = `
                        <div style="background: #fff0f0; padding: 5px; border-radius: 5px; border-left: 4px solid red; margin-bottom: 5px; color: #333; margin-top: 0; margin-left: 0; padding-left: 0;">
                            <strong>⚠️ VirusTotal Detections (${stats.malicious}):</strong><br>
                            <ul style="margin: 5px 0 0 5px; padding: 0;">
                                ${badVendors.map(v => `<li>${v}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                } else {
                    // It's Clean
                    vtReportHtml = `
                        <div style="background: #f0fff4; padding: 5px; border-radius: 5px; border-left: 0px solid green; margin-bottom: 10px; color: #333; margin-top: 0; margin-left: 0; padding-left: 0;">
                            <strong>✅ VirusTotal Clean:</strong> 0/${stats.harmless + stats.malicious} vendors flagged this site.
                        </div>
                    `;
                }
            } else if (vtRes.status === 404) {
                // URL has never been scanned before
                vtReportHtml = `
                    <div style="background: #f9f9f9; padding: 10px; border-radius: 5px; margin-bottom: 10px; border-left: 4px solid gray;">
                        <strong>ℹ️ VirusTotal:</strong> URL not found in database (New URL).
                    </div>
                `;
            } else {
                vtReportHtml = `<p style="color:orange;">(VirusTotal error: ${vtRes.status})</p>`;
            }
        }
    } catch (err) {
        console.error("VT Error:", err);
        vtReportHtml = `<p style="color:orange;">(VirusTotal connection failed)</p>`;
    }

    // Update UI
    updateUI("ANALYZING...", `${vtReportHtml}<br><strong>Gemini is thinking...</strong>`);

    // --- 3. Gemini Call (Runs AFTER VirusTotal is submitted) ---
    let finalAlert = { status: "CHECKING...", details: [] };

    try {
        const geminiPrompt = `
            Perform a comprehensive web search for all known security risks associated with the website: **${websiteUrl}**. 
            This includes, but is not limited to: 
            1. Active malware or phishing reports.
            2. Major data breaches or security incidents.
            3. Widespread, reliable scam reports.

            In addition, check for any recent news articles or trusted security blogs discussing vulnerabilities or threats related to this website. Here is a summary of vendors reporting the site on VirusTotal to assist in your summary: ${vtReportHtml}. If the vendors Fortinet, BitDefender, or VIPRE report an issue, please consider that a higher-severity finding. Only reserve 1 to 2 bullet points regarding VirusTotal for Evidence.

            Based on the search results, determine the overall safety rating (HIGH DANGER, MEDIUM WARNING, or SAFE) and provide a concise summary.

            Please use the following format:
            **Summary of Findings**
            (Short summary up to 100 words here)

            *Evidence*:
            List at least 4 results and list each result as " -- *title reason*: very short description of said reason (around 10 words or less ONLY for safe sites)"
        `;
        
        const systemInstruction =
            "You are a website safety analyst. Your response MUST begin with the final safety rating (HIGH DANGER 🚨, MEDIUM WARNING ⚠️, or SAFE ✅) followed by a brief, professional summary of the findings.";

        const body = {
            model: "gemini-2.5-flash",
            contents: [
                { role: "user", parts: [{ text: systemInstruction }] },
                { role: "user", parts: [{ text: geminiPrompt }] }
            ]
        };

        const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!geminiRes.ok) {
            const errorData = await geminiRes.json();
            const message = errorData.error ? errorData.error.message : geminiRes.statusText;
            updateUI("API ERROR", `${vtReportHtml}<br><strong>Gemini Error:</strong> ${message}`);
            return;
        }

        const geminiData = await geminiRes.json();
        const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!geminiText) {
            updateUI("NO RESPONSE", `${vtReportHtml}<br>The model did not return a valid safety analysis.`);
            return;
        }

        // Extract Rating
        if (geminiText.includes("HIGH DANGER 🚨")) finalAlert.status = "HIGH DANGER 🚨";
        else if (geminiText.includes("MEDIUM WARNING ⚠️")) finalAlert.status = "MEDIUM WARNING ⚠️";
        else if (geminiText.includes("SAFE ✅")) finalAlert.status = "SAFE ✅";
        else finalAlert.status = "UNKNOWN RATING";
        
        // Clean up text
        finalAlert.details.push(geminiText.replace(/HIGH DANGER 🚨|MEDIUM WARNING ⚠️|SAFE ✅|UNKNOWN RATING/g, '').trim());

    } catch (error) {
        console.error("Gemini Network Error:", error);
        finalAlert.status = "NETWORK ERROR";
        finalAlert.details.push("Could not connect to Gemini API.");
    }
    
    // --- 4. Final Display (Merge VT and Gemini) ---
    // We combine the VirusTotal HTML block with the Gemini text block
    const finalHtml = `
        ${vtReportHtml}
        <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
        ${finalAlert.details.join('')}
    `;

    updateUI(finalAlert.status, finalHtml);
});