document.getElementById("ask").addEventListener("click", async () => {
  const prompt = document.getElementById("prompt").value;
  const responseDiv = document.getElementById("response");
  responseDiv.textContent = "Thinking...";

  // Get active tab info (assuming this is a Chrome Extension context)
   document.getElementById("ask").addEventListener("click", async () => {
    const websiteUrl = document.getElementById("prompt").value; // Assuming 'prompt' holds the URL
    const responseDiv = document.getElementById("response");
    responseDiv.textContent = "Checking safety and reputation using Gemini/Search...";
    
    // --- 1. Define API Key and Endpoint ---
    const geminiApiKey = "AIzaSyA7M0DeyR9wqCBcvLJ_QWqnW2GoDMbEucU"; // ONLY ONE KEY NEEDED NOW
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    let finalAlert = { status: "CHECKING...", details: [] };
    
    // --- 2. Perform Gemini/Search Check (Comprehensive Safety) ---
    try {
        // The prompt now combines the search for malware/phishing (via Google Search)
        // with the search for data breaches and reputation issues.
        const geminiPrompt = `
            Perform a comprehensive web search for all known security risks associated with the website: **${websiteUrl}**. 
            This includes, but is not limited to: 
            1. Active malware or phishing reports.
            2. Major data breaches or security incidents.
            3. Widespread, reliable scam reports.
            
            Based on the search results, determine the overall safety rating (HIGH DANGER, MEDIUM WARNING, or SAFE) and provide a concise summary of the reasons. If no severe issues are found, state that the site appears generally safe.
        `;
        
        const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
                config: {
                    tools: [{ googleSearch: {} }], // Enable Google Search for comprehensive lookup
                    // Update system instruction to guide the model to provide the rating itself
                    systemInstruction: "You are a website safety analyst. Your response MUST begin with the final safety rating (HIGH DANGER 🚨, MEDIUM WARNING ⚠️, or SAFE ✅) followed by a brief, professional summary of the findings."
                }
            })
        });

        const geminiData = await geminiRes.json();
        
        if (geminiData.error) {
             console.error("Gemini API error:", geminiData.error);
             finalAlert.status = "API ERROR";
             finalAlert.details.push(`Error: ${geminiData.error.message || "Authentication Failed."}`);
        } else {
            const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Could not generate safety summary.";
            
            // Extract the rating and summary from Gemini's response
            if (geminiText.includes("HIGH DANGER 🚨")) {
                finalAlert.status = "HIGH DANGER 🚨";
            } else if (geminiText.includes("MEDIUM WARNING ⚠️")) {
                finalAlert.status = "MEDIUM WARNING ⚠️";
            } else {
                finalAlert.status = "SAFE ✅";
            }
            finalAlert.details.push(geminiText.replace(/HIGH DANGER 🚨|MEDIUM WARNING ⚠️|SAFE ✅/g, '').trim());
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        finalAlert.status = "NETWORK ERROR";
        finalAlert.details.push("Could not connect to the Gemini API.");
    }
    
    // --- 3. Display Final Results ---
    // The display logic is simplified since Gemini provides the rating and summary.
    responseDiv.innerHTML = `
        <h2>Final Safety Rating: <span style="color: ${finalAlert.status.includes('DANGER') ? 'red' : finalAlert.status.includes('WARNING') ? 'orange' : finalAlert.status.includes('SAFE') ? 'green' : 'gray'};">${finalAlert.status}</span></h2>
        <p>${finalAlert.details.join('')}</p>
        <p><em>(Powered by Gemini with Google Search)</em></p>
    `;
});
});
    