//Authors:  Morgan & Evan

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
        <p>${messageHtml}</p>
        <p><em>(Powered by Gemini with Google Search)</em></p>
    `;
}

// Function to get the current tab's URL and populate the input field
async function getCurrentTabUrl() {
    // This is safe because it's the first line and not inside the 'ask' event listener
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const inputField = document.getElementById("prompt");

    if (tab && tab.url && !tab.url.startsWith('chrome:')) {
        inputField.value = tab.url;
    } else {
        inputField.placeholder = "Enter URL (e.g., example.com)";
        // Optional: Pre-populate with a non-security risk URL for easy testing
        // inputField.value = "https://www.google.com";
    }
}

// Run the function immediately when the script loads
getCurrentTabUrl();

// ----------------------------------------------------------------------
// REMAINING CODE (The Gemini Analysis Function)
// ----------------------------------------------------------------------

document.getElementById("ask").addEventListener("click", async () => {
    const websiteUrl = document.getElementById("prompt").value.trim();
    const geminiApiKey = "AIzaSyA7M0DeyR9wqCBcvLJ_QWqnW2GoDMbEucU"; // 🚨 Re-insert your API Key here!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    // --- Start: Immediate Pre-Flight Checks ---
    if (geminiApiKey === "YOUR_API_KEY_HERE" || geminiApiKey.length < 30) {
        updateUI("API KEY ERROR", "<strong>API Key Missing/Invalid:</strong> Please replace 'YOUR_API_KEY_HERE' in the code with your actual Gemini API Key.");
        return;
    }
    
    if (!websiteUrl || websiteUrl.length < 5 || websiteUrl.startsWith('chrome:')) {
        updateUI("INVALID URL", "Please enter a valid URL (e.g., example.com) to analyze.");
        return;
    }
    
    // Set initial loading message
    updateUI("CHECKING...", "Checking safety and reputation using Gemini/Search...");
    
    // --- End: Immediate Pre-Flight Checks ---
    
    let finalAlert = { status: "CHECKING...", details: [] };

    // --- Perform Gemini/Search Check (Comprehensive Safety) ---
    try {
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
                tools: [{ googleSearch: {} }],
                tools: [{ googleSearch: {} }],
                generationConfig: {
                    systemInstruction: "You are a website safety analyst. Your response MUST begin with the final safety rating (HIGH DANGER 🚨, MEDIUM WARNING ⚠️, or SAFE ✅) followed by a brief, professional summary of the findings."
                }
            })
        });

        // 🚨 CRITICAL FIX: Handle non-200 HTTP statuses immediately
        if (!geminiRes.ok) {
            const errorData = await geminiRes.json();
            console.error("Gemini HTTP Error:", errorData);
            
            const message = errorData.error ? 
                `<strong>Code ${errorData.error.code}:</strong> ${errorData.error.message}` : 
                `Unknown HTTP Error: ${geminiRes.status} ${geminiRes.statusText}`;
            
            updateUI("API ERROR", message);
            return; // Stop execution after reporting HTTP error
        }

        const geminiData = await geminiRes.json();
        
        // --- Process Successful Response ---
        const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!geminiText) {
             // Fallback for empty or malformed model response
            updateUI("NO RESPONSE", "The model did not return a valid safety analysis. Please try again.");
            return;
        }

        // Extract the rating and summary
        if (geminiText.includes("HIGH DANGER 🚨")) {
            finalAlert.status = "HIGH DANGER 🚨";
        } else if (geminiText.includes("MEDIUM WARNING ⚠️")) {
            finalAlert.status = "MEDIUM WARNING ⚠️";
        } else if (geminiText.includes("SAFE ✅")) {
             finalAlert.status = "SAFE ✅";
        } else {
             // If the response format is unexpected
             finalAlert.status = "UNKNOWN RATING";
        }
        
        finalAlert.details.push(geminiText.replace(/HIGH DANGER 🚨|MEDIUM WARNING ⚠️|SAFE ✅|UNKNOWN RATING/g, '').trim());

    } catch (error) {
        console.error("Network/Fetch Error:", error);
        finalAlert.status = "NETWORK ERROR";
        finalAlert.details.push("A network error occurred. Check your internet connection or API endpoint.");
    }
    
    // --- Display Final Results ---
    updateUI(finalAlert.status, finalAlert.details.join(''));
});