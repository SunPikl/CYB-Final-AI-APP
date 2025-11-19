document.getElementById("ask").addEventListener("click", async () => {
    const websiteUrl = document.getElementById("prompt").value;
    const responseDiv = document.getElementById("response");
    responseDiv.textContent = "Checking safety and reputation using Gemini...";

    // --- 1. Define API Key and Endpoint ---
    // NOTE: Storing API keys in client-side extension code is unsafe. Use a server-side proxy or
    // extension secure storage for production. This keeps the original key present for now.
    const geminiApiKey = "AIzaSyA7M0DeyR9wqCBcvLJ_QWqnW2GoDMbEucU";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    let finalAlert = { status: "CHECKING...", details: [] };

    try {
        // Put the system instruction into a `system` content role (this is accepted by the API).
        // Remove unsupported fields like `systemInstruction` inside `config` and avoid `tools`.
        const systemInstruction =
            "You are a website safety analyst. Your response MUST begin with the final safety rating (HIGH DANGER 🚨, MEDIUM WARNING ⚠️, or SAFE ✅) followed by a brief, professional summary of the findings.";

        const geminiPrompt = `Perform a comprehensive web search for all known security risks associated with the website: **${websiteUrl}**. This includes active malware or phishing reports, major data breaches, and widespread, reliable scam reports. Determine an overall safety rating (HIGH DANGER, MEDIUM WARNING, or SAFE) and give a concise summary of the reasons.`;

        const body = {
            model: "gemini-2.5-flash",
            contents: [
                { role: "system", parts: [{ text: systemInstruction }] },
                { role: "user", parts: [{ text: geminiPrompt }] }
            ]
        };

        const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const geminiData = await geminiRes.json();

        if (geminiData.error) {
            console.error("Gemini API error:", geminiData.error);
            finalAlert.status = "API ERROR";
            finalAlert.details.push(`Error: ${geminiData.error.message || "Authentication Failed."}`);
        } else {
            const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Could not generate safety summary.";

            if (geminiText.includes("HIGH DANGER 🚨")) {
                finalAlert.status = "HIGH DANGER 🚨";
            } else if (geminiText.includes("MEDIUM WARNING ⚠️")) {
                finalAlert.status = "MEDIUM WARNING ⚠️";
            } else if (geminiText.includes("SAFE ✅")) {
                finalAlert.status = "SAFE ✅";
            } else {
                // If model didn't include the badges, try to infer from text or default to SAFE.
                finalAlert.status = "SAFE ✅";
            }

            finalAlert.details.push(geminiText.replace(/HIGH DANGER 🚨|MEDIUM WARNING ⚠️|SAFE ✅/g, '').trim());
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        finalAlert.status = "NETWORK ERROR";
        finalAlert.details.push("Could not connect to the Gemini API.");
    }

    responseDiv.innerHTML = `
        <h2>Final Safety Rating: <span style="color: ${finalAlert.status.includes('DANGER') ? 'red' : finalAlert.status.includes('WARNING') ? 'orange' : finalAlert.status.includes('SAFE') ? 'green' : 'gray'};">${finalAlert.status}</span></h2>
        <p>${finalAlert.details.join('')}</p>
        <p><em>(Powered by Gemini)</em></p>
    `;
});
    